import {
  DataSource,
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
  TransactionCommitEvent,
  QueryRunner,
} from 'typeorm';
import { Logger } from '@nestjs/common';
import { Bookings } from './bookings.entity';
import { BookingStatus } from './booking-status.constants';
import { ProWalletService } from '../../providers/pro_wallet/pro_wallet.service';
import { BookingMailService } from './booking-mail.service';

interface PendingCredit {
  bookingId: number;
  shopId: number;
  amount: number;
  label: string;
}

@EventSubscriber()
export class BookingsSubscriber implements EntitySubscriberInterface<Bookings> {
  private readonly logger = new Logger(BookingsSubscriber.name);

  /**
   * Credits queued in afterUpdate, applied only in afterTransactionCommit —
   * never inside afterUpdate itself.
   *
   * Why: afterUpdate fires WHILE the booking's own transaction is still open
   * and still holding its row lock. creditForBooking() opens its own separate
   * transaction (a different DB connection) and inserts a `transactions` row
   * with a real FK to `bookings.id` — which requires InnoDB to take a shared
   * lock on that same booking row. That shared lock is blocked by the still-open
   * outer transaction's exclusive lock, and the outer transaction is itself
   * sitting in JS awaiting this credit to finish. Neither side is visibly
   * lock-waiting to the other from InnoDB's perspective (the outer connection
   * isn't blocked on any query — it's blocked on a JS Promise), so MySQL's
   * deadlock detector can't see the cycle; it just sits until
   * innodb_lock_wait_timeout (50s) kills the wait. This was reproduced live in
   * prod for bookings #93, #96 and #97 via sys.innodb_lock_waits.
   *
   * Deferring the credit to after the outer transaction has actually committed
   * (and released its lock) removes the cycle entirely.
   */
  private readonly pendingCredits = new WeakMap<QueryRunner, PendingCredit[]>();

  constructor(
    private readonly dataSource: DataSource,
    private readonly proWalletService: ProWalletService,
    private readonly bookingMail: BookingMailService,
  ) {
    // @nestjs/typeorm does NOT auto-register @EventSubscriber() classes the way it
    // does entities — TypeORM only activates subscribers listed in the DataSource's
    // `subscribers` option. Since this subscriber needs Nest-injected dependencies
    // (ProWalletService, BookingMailService), it must register itself here instead
    // of being passed as a bare class to `subscribers: [...]` in TypeOrmModule.forRoot
    // (which would construct it with `new BookingsSubscriber()`, no DI, and crash).
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return Bookings;
  }

  afterInsert(event: InsertEvent<Bookings>): void {
    const booking = event.entity;
    // A booking created already confirmed (e.g. paid instantly from the wallet)
    // never goes through afterUpdate, so notify the provider here.
    if (booking && booking.booking_status === BookingStatus.CONFIRMED) {
      void this.bookingMail.sendNewBookingEmail(booking);
    }
  }

  async afterUpdate(event: UpdateEvent<Bookings>): Promise<void> {
    const oldStatus = event.databaseEntity?.booking_status;
    const newStatus = event.entity?.booking_status;
    if (newStatus == null) return;

    const statusChanged = oldStatus != null && newStatus !== oldStatus;
    const becameDone = newStatus === BookingStatus.DONE && oldStatus !== BookingStatus.DONE;
    if (!statusChanged && !becameDone) return;

    const bookingId = event.entity?.id ?? event.databaseEntity?.id;
    if (!bookingId) return;

    // Reload full entity (event.entity may be partial) via the SAME transactional
    // manager — not a fresh connection — so this sees the row this transaction
    // already holds locked, instead of racing it.
    const booking = await event.manager.getRepository(Bookings).findOne({ where: { id: bookingId } });
    if (!booking) return;

    // Queue the provider-wallet credit; actually applied in afterTransactionCommit.
    if (becameDone && booking.provider_id && booking.amount > 0) {
      const queryRunner = event.queryRunner;
      const credit: PendingCredit = {
        bookingId: booking.id,
        shopId: booking.provider_id,
        amount: booking.amount,
        label: `Booking #${booking.id} completed`,
      };
      if (queryRunner) {
        const queued = this.pendingCredits.get(queryRunner) ?? [];
        queued.push(credit);
        this.pendingCredits.set(queryRunner, queued);
      } else {
        // No transaction context (shouldn't normally happen for a .save()) — apply directly.
        await this.applyCredit(credit);
      }
    }

    // Email the provider about the change (fire-and-forget — never blocks the tx).
    if (statusChanged) {
      if (oldStatus === BookingStatus.PENDING_PAYMENT && newStatus === BookingStatus.CONFIRMED) {
        // Payment just confirmed → this is effectively a new booking.
        void this.bookingMail.sendNewBookingEmail(booking);
      } else if (oldStatus !== BookingStatus.PENDING_PAYMENT) {
        // Skip changes from PENDING_PAYMENT to a non-confirmed state (payment
        // failed / stale-cancelled): that booking was never the provider's.
        void this.bookingMail.sendStatusChangeEmail(booking, oldStatus);
      }
    }
  }

  async afterTransactionCommit(event: TransactionCommitEvent): Promise<void> {
    const queued = this.pendingCredits.get(event.queryRunner);
    if (!queued?.length) return;
    this.pendingCredits.delete(event.queryRunner);

    for (const credit of queued) {
      await this.applyCredit(credit);
    }
  }

  private async applyCredit(credit: PendingCredit): Promise<void> {
    // Idempotent (keyed on booking id), so a failure here can be safely retried
    // (e.g. via ProWalletService.reconcileBookingCredits).
    try {
      await this.proWalletService.creditForBooking(
        credit.shopId,
        credit.amount,
        credit.label,
        credit.bookingId,
      );
    } catch (err) {
      this.logger.error(
        `Failed to credit wallet for completed booking #${credit.bookingId} ` +
          `(shop ${credit.shopId}, amount ${credit.amount}): ${err?.message ?? err}`,
        err?.stack,
      );
    }
  }
}
