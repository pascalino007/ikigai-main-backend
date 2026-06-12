import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Transaction } from '../transaction/transaction.entity';
import { Bookings } from '../client/bookings/bookings.entity';
import { ClientWallet } from '../client/client_wallet/client_wallet.entity';
import { BookingStatus } from '../client/bookings/booking-status.constants';
import { TransactionMotif, TransactionStatus } from '../transaction/transaction.contants';
import {
  NormalizedPaymentEvent,
  normalizePaymentWebhook,
} from './payment-webhook.adapters';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { Shops } from '../shops/shop.entity';
import { Services } from '../services/services.entity';
import { Users } from '../users/user.entity';
import { Notification } from '../notifications/notification.entity';
import { Subscription } from '../subscriptions/subscription.entity';
import { SubscriptionPlan } from '../subscriptions/subscription-plan.entity';
import { MiServiceOrder } from '../mi-services/mi-service-order.entity';

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Shops)
    private readonly shopsRepo: Repository<Shops>,
    @InjectRepository(Services)
    private readonly servicesRepo: Repository<Services>,
    @InjectRepository(Users)
    private readonly usersRepo: Repository<Users>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepo: Repository<Subscription>,
    @InjectRepository(SubscriptionPlan)
    private readonly planRepo: Repository<SubscriptionPlan>,
    private readonly notificationsService: NotificationsService,
    private readonly mailService: MailService,
  ) {}

  parseAndNormalize(provider: string, body: unknown): NormalizedPaymentEvent {
    return normalizePaymentWebhook(provider, body);
  }

  /**
   * Apply aggregator result. Idempotent: repeated success webhooks are safe.
   * Handles both BOOKING_PAYMENT and WALLET_DEPOSIT motifs.
   */
  async applyPaymentEvent(event: NormalizedPaymentEvent): Promise<void> {
    if (event.status === 'pending') {
      this.logger.verbose(`Ignoring pending webhook for ${event.transactionRef}`);
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      // ── BULK BOOKING PAYMENT — fan out to all transactions sharing the bulkRef.
      // The bulkRef is sent to the aggregator as the merchant `transactionRef`.
      if (event.transactionRef) {
        const bulkTxns = await manager.find(Transaction, {
          where: { bulkRef: event.transactionRef },
          relations: { booking: true },
          lock: { mode: 'pessimistic_write' },
        });
        if (bulkTxns.length > 0) {
          for (const txn of bulkTxns) {
            if (txn.transactionMotifId === TransactionMotif.BOOKING_PAYMENT) {
              await this.applyBookingPaymentEvent(manager, txn, event);
            }
          }
          return;
        }
      }

      let txn = event.transactionRef
        ? await manager.findOne(Transaction, {
            where: { transactionRef: event.transactionRef },
            relations: { booking: true },
            lock: { mode: 'pessimistic_write' },
          })
        : null;

      if (!txn && event.externalPaymentId) {
        txn = await manager.findOne(Transaction, {
          where: { externalPaymentId: event.externalPaymentId },
          relations: { booking: true },
          lock: { mode: 'pessimistic_write' },
        });
      }

      if (!txn) {
        throw new NotFoundException('Transaction not found for webhook');
      }

      // ── WALLET DEPOSIT ──
      if (txn.transactionMotifId === TransactionMotif.WALLET_DEPOSIT) {
        await this.applyDepositEvent(manager, txn, event);
        return;
      }

      // ── BOOKING PAYMENT ──
      if (txn.transactionMotifId === TransactionMotif.BOOKING_PAYMENT) {
        await this.applyBookingPaymentEvent(manager, txn, event);
        return;
      }

      // ── SUBSCRIPTION PAYMENT ──
      if (txn.transactionMotifId === TransactionMotif.SUBSCRIPTION) {
        await this.applySubscriptionEvent(manager, txn, event);
        return;
      }

      // ── MI SERVICE PAYMENT ──
      if (txn.transactionMotifId === TransactionMotif.MI_SERVICE) {
        await this.applyMiServiceEvent(manager, txn, event);
        return;
      }

      throw new BadRequestException(
        `Unsupported transaction motif ${txn.transactionMotifId} for webhook`,
      );
    });
  }

  /** Credit wallet on successful external deposit (Stripe / Kkiapay). */
  private async applyDepositEvent(
    manager: import('typeorm').EntityManager,
    txn: Transaction,
    event: NormalizedPaymentEvent,
  ): Promise<void> {
    if (event.status === 'succeeded') {
      if (txn.status === TransactionStatus.SUCCESS) {
        return; // idempotent
      }

      const wallet = await manager.findOne(ClientWallet, {
        where: { client_id: txn.toUserId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        throw new NotFoundException('Wallet not found for deposit');
      }

      wallet.balance += txn.amount;
      await manager.save(ClientWallet, wallet);

      txn.status = TransactionStatus.SUCCESS;
      txn.balanceAfter = wallet.balance;
      if (event.externalPaymentId) {
        txn.externalPaymentId = event.externalPaymentId;
      }
      await manager.save(Transaction, txn);

      this.logger.log(
        `Deposit ${txn.transactionRef} succeeded – wallet ${wallet.client_id} credited ${txn.amount} XOF (new balance: ${wallet.balance})`,
      );

      // ── Send email + in-app notification to user ──
      await this.notifyUserOfDeposit(txn.toUserId, txn.amount, wallet.balance);
      return;
    }

    if (event.status === 'failed') {
      if (txn.status === TransactionStatus.SUCCESS) {
        this.logger.warn(
          `Late failure for already successful deposit ${txn.transactionRef}`,
        );
        return;
      }
      txn.status = TransactionStatus.FAILED;
      if (event.externalPaymentId) {
        txn.externalPaymentId = event.externalPaymentId;
      }
      await manager.save(Transaction, txn);
    }
  }

  /** Email + in-app notification when a user's deposit succeeds. */
  private async notifyUserOfDeposit(
    userId: number,
    amount: number,
    newBalance: number,
  ): Promise<void> {
    try {
      const user = await this.usersRepo.findOne({ where: { id: userId } });
      if (!user) return;

      // 1. In-app notification
      await this.notificationRepo.save({
        user_id: userId,
        type: 'deposit',
        title: 'Dépôt reçu !',
        body: `${amount.toLocaleString('fr-FR')} FCFA ont été ajoutés à votre portefeuille. Nouveau solde : ${newBalance.toLocaleString('fr-FR')} FCFA.`,
        is_read: false,
      });

      // 2. Email
      await this.mailService.sendMail({
        to: user.email,
        subject: 'Dépôt confirmé – Ikigai',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #333;">
            <h2 style="color: #002D39;">Bonjour ${user.firstname},</h2>
            <p>Votre portefeuille Ikigai a été crédité avec succès.</p>
            <div style="background: #f5f6fa; border-radius: 12px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0; font-size: 14px; color: #666;">Montant du dépôt</p>
              <p style="margin: 8px 0 0 0; font-size: 22px; font-weight: bold; color: #002D39;">
                ${amount.toLocaleString('fr-FR')} FCFA
              </p>
              <hr style="border: none; border-top: 1px solid #ddd; margin: 16px 0;" />
              <p style="margin: 0; font-size: 14px; color: #666;">Nouveau solde</p>
              <p style="margin: 8px 0 0 0; font-size: 18px; font-weight: bold; color: #10B981;">
                ${newBalance.toLocaleString('fr-FR')} FCFA
              </p>
            </div>
            <p style="font-size: 13px; color: #888;">Merci de faire confiance à Ikigai.</p>
          </div>
        `,
      });
    } catch (e) {
      this.logger.error(`Failed to notify user ${userId} of deposit: ${e.message}`);
    }
  }

  /** Confirm Mi service order on successful payment. */
  private async applyMiServiceEvent(
    manager: import('typeorm').EntityManager,
    txn: Transaction,
    event: NormalizedPaymentEvent,
  ): Promise<void> {
    if (event.status === 'succeeded') {
      if (txn.status === TransactionStatus.SUCCESS) {
        return; // idempotent
      }
      txn.status = TransactionStatus.SUCCESS;
      if (event.externalPaymentId) {
        txn.externalPaymentId = event.externalPaymentId;
      }
      await manager.save(Transaction, txn);

      const meta = (txn.metadata ?? {}) as Record<string, unknown>;
      const orderId = typeof meta.orderId === 'number' ? meta.orderId : Number(meta.orderId);

      if (orderId) {
        const order = await manager.findOne(MiServiceOrder, { where: { id: orderId } });
        if (order) {
          order.status = 'paid';
          if (event.externalPaymentId) {
            order.external_payment_id = event.externalPaymentId;
          }
          await manager.save(MiServiceOrder, order);
        }
      }

      this.logger.log(`Mi service order ${orderId} paid successfully via ${txn.transactionRef}`);
      return;
    }

    if (event.status === 'failed') {
      if (txn.status === TransactionStatus.SUCCESS) {
        this.logger.warn(`Late failure for already successful Mi service ${txn.transactionRef}`);
        return;
      }
      txn.status = TransactionStatus.FAILED;
      if (event.externalPaymentId) {
        txn.externalPaymentId = event.externalPaymentId;
      }
      await manager.save(Transaction, txn);

      const meta = (txn.metadata ?? {}) as Record<string, unknown>;
      const orderId = typeof meta.orderId === 'number' ? meta.orderId : Number(meta.orderId);
      if (orderId) {
        const order = await manager.findOne(MiServiceOrder, { where: { id: orderId } });
        if (order) {
          order.status = 'failed';
          await manager.save(MiServiceOrder, order);
        }
      }
    }
  }

  /** Create subscription record on successful payment. */
  private async applySubscriptionEvent(
    manager: import('typeorm').EntityManager,
    txn: Transaction,
    event: NormalizedPaymentEvent,
  ): Promise<void> {
    const meta = (txn.metadata ?? {}) as Record<string, unknown>;
    const planName = String(meta.plan ?? '');
    const interval = String(meta.interval ?? 'month');
    const userId = typeof meta.userId === 'number' ? meta.userId : Number(meta.userId);
    const shopId = meta.shopId ? (typeof meta.shopId === 'number' ? meta.shopId : Number(meta.shopId)) : null;

    if (event.status === 'succeeded') {
      if (txn.status === TransactionStatus.SUCCESS) {
        return; // idempotent
      }

      txn.status = TransactionStatus.SUCCESS;
      if (event.externalPaymentId) {
        txn.externalPaymentId = event.externalPaymentId;
      }
      await manager.save(Transaction, txn);

      // Create the subscription
      const sub = manager.create(Subscription, {
        user_id: userId,
        shop_id: shopId,
        plan: planName,
        status: 'active',
        price: txn.amount,
        currency: txn.currency,
        interval,
        started_at: new Date(),
        next_billing: interval === 'year'
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
          : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      await manager.save(Subscription, sub);

      this.logger.log(`Subscription created for user ${userId} / shop ${shopId}: ${planName} (${interval})`);

      // Notify user
      try {
        const user = await this.usersRepo.findOne({ where: { id: userId } });
        if (user) {
          await this.notificationRepo.save({
            user_id: userId,
            type: 'subscription',
            title: 'Abonnement activé',
            body: `Votre abonnement ${planName} (${interval}) est maintenant actif.`,
            is_read: false,
          });
        }
      } catch (e) {
        this.logger.error(`Failed to notify user ${userId} of subscription: ${e.message}`);
      }
      return;
    }

    if (event.status === 'failed') {
      if (txn.status === TransactionStatus.SUCCESS) {
        this.logger.warn(`Late failure for already successful subscription ${txn.transactionRef}`);
        return;
      }
      txn.status = TransactionStatus.FAILED;
      if (event.externalPaymentId) {
        txn.externalPaymentId = event.externalPaymentId;
      }
      await manager.save(Transaction, txn);
    }
  }

  private async notifyProviderOfBooking(providerId: number, serviceName: string, bookingDate: string, bookingTime?: string) {
    const shop = await this.shopsRepo.findOne({ where: { id: providerId } });
    if (shop?.fcm_token) {
      const timeStr = bookingTime ? ` à ${bookingTime}` : '';
      await this.notificationsService.sendPushNotification({
        token: shop.fcm_token,
        title: 'Nouvelle réservation',
        body: `${serviceName} · ${bookingDate}${timeStr}`,
        data: {
          type: 'new_booking',
          providerId: String(providerId),
        },
      });
    }
  }

  /** Confirm or fail a booking payment from external provider. */
  private async applyBookingPaymentEvent(
    manager: import('typeorm').EntityManager,
    txn: Transaction,
    event: NormalizedPaymentEvent,
  ): Promise<void> {
    if (!txn.booking) {
      throw new BadRequestException('Booking payment has no linked booking');
    }

    // For bulk transactions, externalPaymentId would collide on the UNIQUE index
    // across N sub-transactions. We skip setting it on bulk rows (they're already
    // correlated via the shared `bulkRef`).
    const canSetExternal = !txn.bulkRef && event.externalPaymentId;

    if (event.status === 'succeeded') {
      if (txn.status === TransactionStatus.SUCCESS) {
        return;
      }
      txn.status = TransactionStatus.SUCCESS;
      if (canSetExternal) {
        txn.externalPaymentId = event.externalPaymentId!;
      }
      await manager.save(Transaction, txn);

      txn.booking.booking_status = BookingStatus.CONFIRMED;
      txn.booking.payement_status = 1;
      txn.booking.qr_checkin_token = crypto.randomUUID().replace(/-/g, '');
      await manager.save(Bookings, txn.booking);

      const service = await this.servicesRepo.findOne({ where: { id: txn.booking.service_id } });
      const timeStr = txn.booking.booking_time
        ? txn.booking.booking_time.toISOString().slice(11, 16)
        : undefined;
      await this.notifyProviderOfBooking(
        txn.booking.provider_id,
        service?.name ?? 'Service',
        txn.booking.booking_date ?? '',
        timeStr,
      );
      return;
    }

    if (event.status === 'failed') {
      if (txn.status === TransactionStatus.SUCCESS) {
        this.logger.warn(
          `Late failure webhook for already successful ${txn.transactionRef}`,
        );
        return;
      }
      txn.status = TransactionStatus.FAILED;
      if (canSetExternal) {
        txn.externalPaymentId = event.externalPaymentId!;
      }
      await manager.save(Transaction, txn);

      txn.booking.booking_status = BookingStatus.PAYMENT_FAILED;
      txn.booking.payement_status = 0;
      await manager.save(Bookings, txn.booking);
    }
  }
}
