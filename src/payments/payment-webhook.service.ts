import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
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

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(private readonly dataSource: DataSource) {}

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

  /** Confirm or fail a booking payment from external provider. */
  private async applyBookingPaymentEvent(
    manager: import('typeorm').EntityManager,
    txn: Transaction,
    event: NormalizedPaymentEvent,
  ): Promise<void> {
    if (!txn.booking) {
      throw new BadRequestException('Booking payment has no linked booking');
    }

    if (event.status === 'succeeded') {
      if (txn.status === TransactionStatus.SUCCESS) {
        return;
      }
      txn.status = TransactionStatus.SUCCESS;
      if (event.externalPaymentId) {
        txn.externalPaymentId = event.externalPaymentId;
      }
      await manager.save(Transaction, txn);

      txn.booking.booking_status = BookingStatus.CONFIRMED;
      txn.booking.payement_status = 1;
      txn.booking.qr_checkin_token = crypto.randomUUID().replace(/-/g, '');
      await manager.save(Bookings, txn.booking);
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
      if (event.externalPaymentId) {
        txn.externalPaymentId = event.externalPaymentId;
      }
      await manager.save(Transaction, txn);

      txn.booking.booking_status = BookingStatus.PAYMENT_FAILED;
      txn.booking.payement_status = 0;
      await manager.save(Bookings, txn.booking);
    }
  }
}
