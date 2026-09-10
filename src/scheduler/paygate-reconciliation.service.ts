import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Transaction } from '../transaction/transaction.entity';
import { TransactionStatus } from '../transaction/transaction.contants';
import { PaygateService } from '../payments/paygate.service';
import { PaymentWebhookService } from '../payments/payment-webhook.service';
import { RedisService } from '../redis/redis.service';

/**
 * PayGate's Méthode 1 (the direct USSD push used for Flooz/T-Money) has no
 * reliable webhook — normally the mobile app's own confirmation screen
 * re-checks PayGate every 2s while it's open (see
 * TransactionsService.getTransactionByRef, which calls the exact same
 * PaygateService.checkStatusByIdentifier + PaymentWebhookService this job
 * uses). But confirming a USSD prompt takes the customer OUT of the app —
 * if they don't come straight back (or the app gets backgrounded/killed),
 * nothing ever asks PayGate again. The transaction — and the booking it
 * paid for — is then stuck PENDING forever even though the money was
 * actually taken, and BookingSchedulerService.cancelStalePendingBookings
 * would go on to auto-cancel a booking that was, in fact, paid for.
 *
 * This job is the server-side safety net: it re-checks every PayGate
 * transaction still pending, independent of whether any client is polling,
 * so a completed payment gets confirmed (and the client pushed a
 * notification) even if they never look at the app again.
 */
@Injectable()
export class PaygateReconciliationService {
  private readonly logger = new Logger(PaygateReconciliationService.name);

  /** Stop retrying PayGate after this long — by then it's genuinely dead,
   *  not just slow. Keep in sync with the cutoff BookingSchedulerService
   *  uses before it gives up on a stale paygate-paid booking. */
  static readonly MAX_AGE_HOURS = 6;

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,
    private readonly paygateService: PaygateService,
    private readonly paymentWebhookService: PaymentWebhookService,
    private readonly redis: RedisService,
  ) {}

  /** Runs every minute. */
  @Cron('*/1 * * * *')
  async reconcilePendingPaygateTransactions(): Promise<void> {
    if (!this.paygateService.isConfigured) return;
    if (!(await this.redis.acquireLock('cron:paygate-reconcile', 50))) return;

    const cutoff = new Date(
      Date.now() - PaygateReconciliationService.MAX_AGE_HOURS * 60 * 60 * 1000,
    );

    const pending = await this.transactionRepo.find({
      where: {
        paymentProvider: 'paygate',
        status: TransactionStatus.PENDING,
        createdAt: MoreThan(cutoff),
      },
    });

    if (pending.length === 0) return;

    this.logger.log(`[reconcile] checking ${pending.length} pending PayGate transaction(s)`);

    for (const txn of pending) {
      try {
        const result = await this.paygateService.checkStatusByIdentifier(txn.transactionRef);
        if (!result || result.outcome === 'pending') continue;

        this.logger.log(
          `[reconcile] ref=${txn.transactionRef} resolved by background sweep: outcome=${result.outcome}`,
        );
        await this.paymentWebhookService.applyPaymentEvent({
          status: result.outcome,
          transactionRef: txn.transactionRef,
          externalPaymentId: result.txReference,
        });
      } catch (err: any) {
        this.logger.error(
          `[reconcile] failed for ref=${txn.transactionRef}: ${err?.message ?? err}`,
        );
      }
    }
  }
}
