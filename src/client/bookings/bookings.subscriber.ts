import {
  EventSubscriber,
  EntitySubscriberInterface,
  UpdateEvent,
} from 'typeorm';
import { Bookings } from './bookings.entity';
import { BookingStatus } from './booking-status.constants';
import { ProWalletService } from '../../providers/pro_wallet/pro_wallet.service';

@EventSubscriber()
export class BookingsSubscriber implements EntitySubscriberInterface<Bookings> {
  constructor(private readonly proWalletService: ProWalletService) {}

  listenTo() {
    return Bookings;
  }

  async afterUpdate(event: UpdateEvent<Bookings>): Promise<void> {
    const oldStatus = event.databaseEntity?.booking_status;
    const newStatus = event.entity?.booking_status;

    // Only credit wallet when status transitions TO DONE (5)
    if (newStatus === BookingStatus.DONE && oldStatus !== BookingStatus.DONE) {
      // Reload full entity to get all fields (event.entity may be partial)
      const bookingId = event.entity?.id ?? event.databaseEntity?.id;
      if (!bookingId) return;

      const bookingRepo = event.connection.getRepository(Bookings);
      const booking = await bookingRepo.findOne({ where: { id: bookingId } });
      if (booking && booking.provider_id && booking.amount > 0) {
        await this.proWalletService.creditForBooking(
          booking.provider_id,
          booking.amount,
          `Booking #${booking.id} completed`,
          `BOOKING-PAYOUT-${booking.id}-${Date.now()}`,
        );
      }
    }
  }
}
