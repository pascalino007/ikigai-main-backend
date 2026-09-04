import {
  DataSource,
  EventSubscriber,
  EntitySubscriberInterface,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { Logger } from '@nestjs/common';
import { Bookings } from './bookings.entity';
import { BookingStatus } from './booking-status.constants';
import { ProWalletService } from '../../providers/pro_wallet/pro_wallet.service';
import { BookingMailService } from './booking-mail.service';

@EventSubscriber()
export class BookingsSubscriber implements EntitySubscriberInterface<Bookings> {
  private readonly logger = new Logger(BookingsSubscriber.name);

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

    // Reload full entity (event.entity may be partial).
    const bookingRepo = event.connection.getRepository(Bookings);
    const booking = await bookingRepo.findOne({ where: { id: bookingId } });
    if (!booking) return;

    // Credit the provider wallet when the booking transitions TO DONE.
    if (becameDone && booking.provider_id && booking.amount > 0) {
      // Idempotent (keyed on booking id), so a failure here can be safely retried.
      try {
        await this.proWalletService.creditForBooking(
          booking.provider_id,
          booking.amount,
          `Booking #${booking.id} completed`,
          booking.id,
        );
      } catch (err) {
        this.logger.error(
          `Failed to credit wallet for completed booking #${booking.id} ` +
            `(shop ${booking.provider_id}, amount ${booking.amount}): ${err?.message ?? err}`,
          err?.stack,
        );
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
}
