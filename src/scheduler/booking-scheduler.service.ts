import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Bookings } from '../client/bookings/bookings.entity';
import { BookingStatus } from '../client/bookings/booking-status.constants';

@Injectable()
export class BookingSchedulerService {
  private readonly logger = new Logger(BookingSchedulerService.name);

  constructor(
    @InjectRepository(Bookings)
    private readonly bookingRepo: Repository<Bookings>,
  ) {}

  /**
   * Runs every 15 minutes.
   * Scans all CONFIRMED bookings whose appointment time has passed.
   * Converts them to NO_SHOW so providers and clients see accurate history.
   */
  @Cron('*/15 * * * *')
  async markExpiredConfirmedBookings(): Promise<void> {
    const now = new Date();
    // Build a datetime string for comparison against booking_date + booking_time
    const nowIso = now.toISOString();

    // We need bookings where booking_date + booking_time < now.
    // booking_date is YYYY-MM-DD varchar, booking_time is a datetime column.
    // We'll load candidates and do the datetime math in JS to avoid complex SQL.
    const candidates = await this.bookingRepo.find({
      where: {
        booking_status: BookingStatus.CONFIRMED,
      },
      order: { id: 'ASC' },
    });

    const toUpdate: Bookings[] = [];

    for (const b of candidates) {
      if (!b.booking_date) continue;
      const bookingDateTime = b.booking_time
        ? new Date(
            `${b.booking_date}T${b.booking_time.toISOString().slice(11, 19)}`,
          )
        : new Date(b.booking_date);
      if (bookingDateTime < now) {
        b.booking_status = BookingStatus.NO_SHOW;
        toUpdate.push(b);
      }
    }

    if (toUpdate.length > 0) {
      await this.bookingRepo.save(toUpdate);
      this.logger.log(
        `Marked ${toUpdate.length} expired confirmed booking(s) as NO_SHOW`,
      );
    }
  }

  /**
   * Runs every hour.
   * Auto-cancels PENDING_PAYMENT bookings that were created more than 30 minutes ago
   * and were never completed, freeing up the slot.
   */
  @Cron('0 * * * *')
  async cancelStalePendingBookings(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

    const stale = await this.bookingRepo.find({
      where: {
        booking_status: BookingStatus.PENDING_PAYMENT,
        created_at: LessThan(cutoff),
      },
    });

    if (stale.length === 0) return;

    for (const b of stale) {
      b.booking_status = BookingStatus.CANCELLED;
    }

    await this.bookingRepo.save(stale);
    this.logger.log(
      `Auto-cancelled ${stale.length} stale pending booking(s) older than 30 min`,
    );
  }
}
