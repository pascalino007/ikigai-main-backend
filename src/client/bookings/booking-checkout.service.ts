import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Bookings } from './bookings.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { Services } from '../../services/services.entity';
import { ClientWallet } from '../client_wallet/client_wallet.entity';
import { InitiateBookingCheckoutDto } from './dtos/initiate-booking-checkout.dto';
import { BulkBookingCheckoutDto } from './dtos/bulk-booking-checkout.dto';
import { BookingStatus } from './booking-status.constants';
import { parseServicePriceToAmount } from './service-price.util';
import { TransactionMotif, TransactionStatus } from '../../transaction/transaction.contants';
import { StripeService } from '../../payments/stripe.service';
import { KkiapayService } from '../../payments/kkiapay.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { Shops } from '../../shops/shop.entity';
import { Users } from '../../users/user.entity';
import * as crypto from 'crypto';

export interface BookingCheckoutResult {
  /** 'confirmed' if paid from wallet, 'pending_payment' if external */
  status: 'confirmed' | 'pending_payment';
  booking: Bookings;
  transaction: Transaction;
  payment: {
    provider: string;
    transactionRef: string;
    amount: number;
    currency: string;
    clientInstructions: Record<string, unknown>;
  };
}

export interface BulkBookingCheckoutResult {
  /** 'confirmed' if paid from wallet (single atomic debit), 'pending_payment' if external (single payment intent for the total) */
  status: 'confirmed' | 'pending_payment';
  bulkRef: string;
  totalAmount: number;
  currency: string;
  bookings: Bookings[];
  transactions: Transaction[];
  payment: {
    provider: string;
    /** Shared bulk reference; all transactions in the bulk carry this on `bulkRef`. */
    transactionRef: string;
    amount: number;
    currency: string;
    clientInstructions: Record<string, unknown>;
  };
}

@Injectable()
export class BookingCheckoutService {
  constructor(
    @InjectRepository(Services)
    private readonly servicesRepo: Repository<Services>,
    @InjectRepository(ClientWallet)
    private readonly walletRepo: Repository<ClientWallet>,
    @InjectRepository(Shops)
    private readonly shopsRepo: Repository<Shops>,
    @InjectRepository(Users)
    private readonly usersRepo: Repository<Users>,
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly stripeService: StripeService,
    private readonly kkiapayService: KkiapayService,
    private readonly notificationsService: NotificationsService,
  ) {}

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

  private async notifyClientOfBooking(userId: number, serviceName: string, shopName: string, bookingDate: string, bookingTime?: string) {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (user?.fcm_token) {
      const timeStr = bookingTime ? ` à ${bookingTime}` : '';
      await this.notificationsService.sendPushNotification({
        token: user.fcm_token,
        title: 'Réservation confirmée',
        body: `${serviceName} chez ${shopName} · ${bookingDate}${timeStr}`,
        data: {
          type: 'booking_confirmed',
          userId: String(userId),
        },
      });
    }
  }

  async initiateCheckout(
    dto: InitiateBookingCheckoutDto,
  ): Promise<BookingCheckoutResult> {
    const service = await this.servicesRepo.findOne({
      where: { id: dto.service_id },
    });
    if (!service) {
      throw new NotFoundException('Service not found');
    }
    if (!service.is_active) {
      throw new BadRequestException('Service is not available');
    }
    if (service.provider_id !== dto.provider_id) {
      throw new BadRequestException('Service does not belong to this provider');
    }

    const amount = parseServicePriceToAmount(service.price);
    const currency = 'XOF';
    const durationMinutes = service.duration_minutes || 30;

    // Compute booking_end_time
    const bookingStart = new Date(`1970-01-01T${dto.booking_time}:00`);
    const bookingEnd = new Date(bookingStart.getTime() + durationMinutes * 60000);

    // ── WALLET PAYMENT PATH ──
    if (dto.payment_provider === 'wallet') {
      const result = await this.checkoutWithWallet(dto, amount, currency, bookingEnd);
      const bookingDate = dto.booking_date.slice(0, 10);
      await this.notifyProviderOfBooking(dto.provider_id, service.name, bookingDate, dto.booking_time);
      const shop = await this.shopsRepo.findOne({ where: { id: dto.provider_id } });
      await this.notifyClientOfBooking(dto.user_id, service.name, shop?.name ?? 'votre salon', bookingDate, dto.booking_time);
      return result;
    }

    // ── EXTERNAL PAYMENT PATH (Stripe / Kkiapay / sandbox) ──
    return this.checkoutWithExternalProvider(dto, amount, currency, bookingEnd);
  }

  /**
   * Pay booking from wallet balance.
   * If insufficient → throw 402 with balance info so the app can show top-up screen.
   */
  private async checkoutWithWallet(
    dto: InitiateBookingCheckoutDto,
    amount: number,
    currency: string,
    bookingEnd: Date,
  ): Promise<BookingCheckoutResult> {
    // Payment goes to the service provider
    const settlementUserId = dto.provider_id;

    return this.dataSource.transaction(async (manager) => {
      // Lock wallet for atomic balance check + debit
      let wallet = await manager.findOne(ClientWallet, {
        where: { client_id: dto.user_id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!wallet) {
        wallet = await manager.save(
          ClientWallet,
          manager.create(ClientWallet, { client_id: dto.user_id, balance: 0 }),
        );
      }

      // Insufficient balance → 402
      if (wallet.balance < amount) {
        throw new HttpException(
          {
            statusCode: HttpStatus.PAYMENT_REQUIRED,
            error: 'insufficient_balance',
            message: 'Wallet balance is insufficient for this booking',
            balance: wallet.balance,
            required: amount,
            deficit: amount - wallet.balance,
            currency,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      // Debit wallet
      const balanceBefore = wallet.balance;
      wallet.balance -= amount;
      await manager.save(ClientWallet, wallet);

      // Create confirmed booking with QR check-in token
      const bookingEntity = manager.create(Bookings, {
        user_id: dto.user_id,
        provider_id: dto.provider_id,
        service_id: dto.service_id,
        worker_id: dto.worker_id || null,
        booking_date: dto.booking_date.slice(0, 10),
        booking_time: new Date(`1970-01-01T${dto.booking_time}:00`),
        booking_end_time: bookingEnd,
        booking_status: BookingStatus.CONFIRMED,
        payement_status: 1,
        amount,
        currency,
        qr_checkin_token: crypto.randomUUID().replace(/-/g, ''),
      });
      await manager.save(Bookings, bookingEntity);

      const transactionRef = `BKG-${bookingEntity.id}-${Date.now()}`;

      // Create successful transaction
      const txn = manager.create(Transaction, {
        label: `Booking #${bookingEntity.id} (wallet)`,
        fromUserId: dto.user_id,
        toUserId: settlementUserId,
        amount,
        currency,
        status: TransactionStatus.SUCCESS,
        transactionMotifId: TransactionMotif.BOOKING_PAYMENT,
        transactionRef,
        paymentMethod: 'wallet',
        paymentProvider: 'wallet',
        externalPaymentId: null,
        balanceBefore,
        balanceAfter: wallet.balance,
        booking: bookingEntity,
      });
      await manager.save(Transaction, txn);

      return {
        status: 'confirmed' as const,
        booking: bookingEntity,
        transaction: txn,
        payment: {
          provider: 'wallet',
          transactionRef,
          amount,
          currency,
          clientInstructions: {
            provider: 'wallet',
            message: 'Booking confirmed and paid from wallet',
            newBalance: wallet.balance,
          },
        },
      };
    });
  }

  /**
   * Create a pending booking + transaction, return provider SDK instructions.
   * Booking is confirmed only after the payment webhook arrives.
   */
  private async checkoutWithExternalProvider(
    dto: InitiateBookingCheckoutDto,
    amount: number,
    currency: string,
    bookingEnd: Date,
  ): Promise<BookingCheckoutResult> {
    // Payment goes to the service provider
    const settlementUserId = dto.provider_id;

    const wallet = await this.walletRepo.findOne({
      where: { client_id: dto.user_id },
    });
    const balanceSnapshot = wallet?.balance ?? 0;

    const { booking, transaction } = await this.dataSource.transaction(
      async (manager) => {
        const bookingEntity = manager.create(Bookings, {
          user_id: dto.user_id,
          provider_id: dto.provider_id,
          service_id: dto.service_id,
          worker_id: dto.worker_id || null,
          booking_date: dto.booking_date.slice(0, 10),
          booking_time: new Date(`1970-01-01T${dto.booking_time}:00`),
          booking_end_time: bookingEnd,
          booking_status: BookingStatus.PENDING_PAYMENT,
          payement_status: 0,
          amount,
          currency,
        });
        await manager.save(Bookings, bookingEntity);

        const transactionRef = `BKG-${bookingEntity.id}-${Date.now()}`;

        const txn = manager.create(Transaction, {
          label: `Booking #${bookingEntity.id}`,
          fromUserId: dto.user_id,
          toUserId: settlementUserId,
          amount,
          currency,
          status: TransactionStatus.PENDING,
          transactionMotifId: TransactionMotif.BOOKING_PAYMENT,
          transactionRef,
          paymentMethod: dto.payment_channel,
          paymentProvider: dto.payment_provider,
          externalPaymentId: null,
          balanceBefore: balanceSnapshot,
          balanceAfter: balanceSnapshot,
          booking: bookingEntity,
        });
        await manager.save(Transaction, txn);

        return { booking: bookingEntity, transaction: txn };
      },
    );

    // Build provider-specific client instructions
    const clientInstructions = await this.buildClientInstructions(
      dto.payment_provider,
      transaction.transactionRef,
      amount,
      currency,
      booking.id,
    );

    // Store externalPaymentId if Stripe created one
    if (clientInstructions.paymentIntentId) {
      transaction.externalPaymentId =
        clientInstructions.paymentIntentId as string;
      await this.dataSource.getRepository(Transaction).save(transaction);
    }

    return {
      status: 'pending_payment',
      booking,
      transaction,
      payment: {
        provider: dto.payment_provider,
        transactionRef: transaction.transactionRef,
        amount,
        currency,
        clientInstructions,
      },
    };
  }

  private async buildClientInstructions(
    provider: string,
    transactionRef: string,
    amount: number,
    currency: string,
    bookingId: number,
  ): Promise<Record<string, unknown>> {
    if (provider === 'stripe' && this.stripeService.isConfigured) {
      const intent = await this.stripeService.createPaymentIntent({
        amount,
        currency,
        metadata: {
          transactionRef,
          type: 'booking_payment',
          bookingId: String(bookingId),
        },
      });
      return {
        provider: 'stripe',
        publishableKey: this.stripeService.publishableKey,
        clientSecret: intent.clientSecret,
        paymentIntentId: intent.paymentIntentId,
        transactionRef,
        amount,
        currency: currency.toLowerCase(),
      };
    }

    if (provider === 'kkiapay' && this.kkiapayService.isConfigured) {
      return {
        ...this.kkiapayService.buildWidgetPayload({
          amount,
          transactionRef,
          reason: `Booking #${bookingId}`,
        }),
        transactionRef,
      };
    }

    // Sandbox / fallback
    return {
      provider: 'sandbox',
      hint: 'POST /payments/webhooks/sandbox to simulate success',
      simulateWebhook: {
        method: 'POST',
        path: '/payments/webhooks/sandbox',
        body: {
          transactionRef,
          status: 'succeeded',
          externalPaymentId: `sandbox-${transactionRef}`,
        },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BULK CHECKOUT — pay multiple bookings (e.g. cart) in a single payment.
  // Wallet:   one atomic debit equal to the total, N confirmed bookings + N transactions.
  // External: one payment intent for the total, N pending bookings + N transactions
  //           sharing a `bulkRef`. Webhook fans the result out to every transaction.
  // ─────────────────────────────────────────────────────────────────────────

  async initiateBulkCheckout(
    dto: BulkBookingCheckoutDto,
  ): Promise<BulkBookingCheckoutResult> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('No items to checkout');
    }

    // Load every service, validate ownership / availability and snapshot prices.
    const resolved: Array<{
      item: BulkBookingCheckoutDto['items'][number];
      service: Services;
      amount: number;
    }> = [];

    for (const item of dto.items) {
      const service = await this.servicesRepo.findOne({
        where: { id: item.service_id },
      });
      if (!service) {
        throw new NotFoundException(`Service ${item.service_id} not found`);
      }
      if (!service.is_active) {
        throw new BadRequestException(
          `Service ${item.service_id} is not available`,
        );
      }
      if (service.provider_id !== item.provider_id) {
        throw new BadRequestException(
          `Service ${item.service_id} does not belong to provider ${item.provider_id}`,
        );
      }
      const amount = parseServicePriceToAmount(service.price);
      resolved.push({ item, service, amount });
    }

    const totalAmount = resolved.reduce((s, r) => s + r.amount, 0);
    const currency = 'XOF';
    const bulkRef = `BULK-${dto.user_id}-${Date.now()}-${crypto
      .randomBytes(4)
      .toString('hex')}`;

    if (dto.payment_provider === 'wallet') {
      const result = await this.bulkCheckoutWithWallet(
        dto,
        resolved,
        totalAmount,
        currency,
        bulkRef,
      );
      for (const r of resolved) {
        const bookingDate = r.item.booking_date.slice(0, 10);
        await this.notifyProviderOfBooking(r.item.provider_id, r.service.name, bookingDate, r.item.booking_time);
        const shop = await this.shopsRepo.findOne({ where: { id: r.item.provider_id } });
        await this.notifyClientOfBooking(dto.user_id, r.service.name, shop?.name ?? 'votre salon', bookingDate, r.item.booking_time);
      }
      return result;
    }

    return this.bulkCheckoutWithExternalProvider(
      dto,
      resolved,
      totalAmount,
      currency,
      bulkRef,
    );
  }

  private async bulkCheckoutWithWallet(
    dto: BulkBookingCheckoutDto,
    resolved: Array<{
      item: BulkBookingCheckoutDto['items'][number];
      service: Services;
      amount: number;
    }>,
    totalAmount: number,
    currency: string,
    bulkRef: string,
  ): Promise<BulkBookingCheckoutResult> {
    return this.dataSource.transaction(async (manager) => {
      // Lock wallet for atomic balance check + single debit of the TOTAL.
      let wallet = await manager.findOne(ClientWallet, {
        where: { client_id: dto.user_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!wallet) {
        wallet = await manager.save(
          ClientWallet,
          manager.create(ClientWallet, { client_id: dto.user_id, balance: 0 }),
        );
      }

      if (wallet.balance < totalAmount) {
        throw new HttpException(
          {
            statusCode: HttpStatus.PAYMENT_REQUIRED,
            error: 'insufficient_balance',
            message: 'Wallet balance is insufficient for this bulk checkout',
            balance: wallet.balance,
            required: totalAmount,
            deficit: totalAmount - wallet.balance,
            currency,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }

      const balanceBefore = wallet.balance;
      wallet.balance -= totalAmount; // single debit
      await manager.save(ClientWallet, wallet);

      // Each individual transaction's balanceBefore/After reflects its slice.
      let runningBalance = balanceBefore;
      const bookings: Bookings[] = [];
      const transactions: Transaction[] = [];

      for (const r of resolved) {
        const bookingEntity = manager.create(Bookings, {
          user_id: dto.user_id,
          provider_id: r.item.provider_id,
          service_id: r.item.service_id,
          booking_date: r.item.booking_date.slice(0, 10),
          booking_time: new Date(`1970-01-01T${r.item.booking_time}:00`),
          booking_status: BookingStatus.CONFIRMED,
          payement_status: 1,
          amount: r.amount,
          currency,
          qr_checkin_token: crypto.randomUUID().replace(/-/g, ''),
        });
        await manager.save(Bookings, bookingEntity);
        bookings.push(bookingEntity);

        const slicedBefore = runningBalance;
        runningBalance -= r.amount;

        const txn = manager.create(Transaction, {
          label: `Booking #${bookingEntity.id} (wallet, bulk)`,
          fromUserId: dto.user_id,
          toUserId: r.item.provider_id,
          amount: r.amount,
          currency,
          status: TransactionStatus.SUCCESS,
          transactionMotifId: TransactionMotif.BOOKING_PAYMENT,
          transactionRef: `BKG-${bookingEntity.id}-${Date.now()}-${crypto
            .randomBytes(2)
            .toString('hex')}`,
          bulkRef,
          paymentMethod: 'wallet',
          paymentProvider: 'wallet',
          externalPaymentId: null,
          balanceBefore: slicedBefore,
          balanceAfter: runningBalance,
          booking: bookingEntity,
        });
        await manager.save(Transaction, txn);
        transactions.push(txn);
      }

      return {
        status: 'confirmed' as const,
        bulkRef,
        totalAmount,
        currency,
        bookings,
        transactions,
        payment: {
          provider: 'wallet',
          transactionRef: bulkRef,
          amount: totalAmount,
          currency,
          clientInstructions: {
            provider: 'wallet',
            message: 'Bulk booking confirmed and paid from wallet',
            newBalance: wallet.balance,
            count: bookings.length,
          },
        },
      };
    });
  }

  private async bulkCheckoutWithExternalProvider(
    dto: BulkBookingCheckoutDto,
    resolved: Array<{
      item: BulkBookingCheckoutDto['items'][number];
      service: Services;
      amount: number;
    }>,
    totalAmount: number,
    currency: string,
    bulkRef: string,
  ): Promise<BulkBookingCheckoutResult> {
    const wallet = await this.walletRepo.findOne({
      where: { client_id: dto.user_id },
    });
    const balanceSnapshot = wallet?.balance ?? 0;

    const { bookings, transactions } = await this.dataSource.transaction(
      async (manager) => {
        const bookings: Bookings[] = [];
        const transactions: Transaction[] = [];

        for (const r of resolved) {
          const bookingEntity = manager.create(Bookings, {
            user_id: dto.user_id,
            provider_id: r.item.provider_id,
            service_id: r.item.service_id,
            booking_date: r.item.booking_date.slice(0, 10),
            booking_time: new Date(`1970-01-01T${r.item.booking_time}:00`),
            booking_status: BookingStatus.PENDING_PAYMENT,
            payement_status: 0,
            amount: r.amount,
            currency,
          });
          await manager.save(Bookings, bookingEntity);
          bookings.push(bookingEntity);

          const txn = manager.create(Transaction, {
            label: `Booking #${bookingEntity.id} (bulk)`,
            fromUserId: dto.user_id,
            toUserId: r.item.provider_id,
            amount: r.amount,
            currency,
            status: TransactionStatus.PENDING,
            transactionMotifId: TransactionMotif.BOOKING_PAYMENT,
            transactionRef: `BKG-${bookingEntity.id}-${Date.now()}-${crypto
              .randomBytes(2)
              .toString('hex')}`,
            bulkRef,
            paymentMethod: dto.payment_channel,
            paymentProvider: dto.payment_provider,
            externalPaymentId: null,
            balanceBefore: balanceSnapshot,
            balanceAfter: balanceSnapshot,
            booking: bookingEntity,
          });
          await manager.save(Transaction, txn);
          transactions.push(txn);
        }
        return { bookings, transactions };
      },
    );

    // Build ONE provider intent for the TOTAL, using bulkRef as the merchant reference.
    const clientInstructions = await this.buildBulkClientInstructions(
      dto.payment_provider,
      bulkRef,
      totalAmount,
      currency,
      bookings.length,
    );

    return {
      status: 'pending_payment',
      bulkRef,
      totalAmount,
      currency,
      bookings,
      transactions,
      payment: {
        provider: dto.payment_provider,
        transactionRef: bulkRef,
        amount: totalAmount,
        currency,
        clientInstructions,
      },
    };
  }

  private async buildBulkClientInstructions(
    provider: string,
    bulkRef: string,
    amount: number,
    currency: string,
    count: number,
  ): Promise<Record<string, unknown>> {
    if (provider === 'stripe' && this.stripeService.isConfigured) {
      const intent = await this.stripeService.createPaymentIntent({
        amount,
        currency,
        metadata: {
          transactionRef: bulkRef,
          bulkRef,
          type: 'bulk_booking_payment',
          count: String(count),
        },
      });
      return {
        provider: 'stripe',
        publishableKey: this.stripeService.publishableKey,
        clientSecret: intent.clientSecret,
        paymentIntentId: intent.paymentIntentId,
        transactionRef: bulkRef,
        bulkRef,
        amount,
        currency: currency.toLowerCase(),
        count,
      };
    }

    if (provider === 'kkiapay' && this.kkiapayService.isConfigured) {
      return {
        ...this.kkiapayService.buildWidgetPayload({
          amount,
          transactionRef: bulkRef,
          reason: `Bulk booking (${count} services)`,
        }),
        transactionRef: bulkRef,
        bulkRef,
        count,
      };
    }

    // Sandbox fallback
    return {
      provider: 'sandbox',
      hint: 'POST /payments/webhooks/sandbox to simulate success of the whole bulk',
      simulateWebhook: {
        method: 'POST',
        path: '/payments/webhooks/sandbox',
        body: {
          transactionRef: bulkRef,
          status: 'succeeded',
          externalPaymentId: `sandbox-${bulkRef}`,
        },
      },
      transactionRef: bulkRef,
      bulkRef,
      count,
    };
  }
}
