import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { Bookings } from '../client/bookings/bookings.entity';
import { BookingStatus } from '../client/bookings/booking-status.constants';
import { RedisService } from '../redis/redis.service';
import { Shops } from '../shops/shop.entity';
import { Users } from '../users/user.entity';
import { Services } from '../services/services.entity';
import { Notification } from '../notifications/notification.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { PaygateReconciliationService } from './paygate-reconciliation.service';

/** How long before the booked time the reminder push goes out. */
const REMINDER_MINUTES_BEFORE = 15;

@Injectable()
export class BookingSchedulerService {
  private readonly logger = new Logger(BookingSchedulerService.name);

  constructor(
    @InjectRepository(Bookings)
    private readonly bookingRepo: Repository<Bookings>,
    @InjectRepository(Shops)
    private readonly shopsRepo: Repository<Shops>,
    @InjectRepository(Users)
    private readonly usersRepo: Repository<Users>,
    @InjectRepository(Services)
    private readonly servicesRepo: Repository<Services>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly notificationsService: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Runs every 15 minutes.
   * Scans all CONFIRMED bookings whose appointment time has passed.
   * Converts them to NO_SHOW so providers and clients see accurate history.
   */
  @Cron('*/15 * * * *')
  async markExpiredConfirmedBookings(): Promise<void> {
    if (!(await this.redis.acquireLock('cron:mark-no-show', 50))) return;

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
   *
   * Exception: bookings paid via PayGate (Flooz/T-Money) get a much longer
   * grace period. PayGate's Méthode 1 push has no reliable webhook — the
   * customer may have already paid on their phone, but confirmation only
   * lands once something re-checks PayGate's status (the app polling while
   * open, or PaygateReconciliationService's background sweep in the
   * meantime). Cancelling those at the same 30-minute mark as an abandoned
   * wallet/card checkout risks cancelling a booking that was actually paid
   * for — so they're only swept here once PaygateReconciliationService's own
   * retry window (MAX_AGE_HOURS) has passed and reconciliation still hasn't
   * resolved them.
   */
  @Cron('0 * * * *')
  async cancelStalePendingBookings(): Promise<void> {
    if (!(await this.redis.acquireLock('cron:cancel-stale', 50))) return;

    const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
    const paygateCutoff = new Date(
      Date.now() - PaygateReconciliationService.MAX_AGE_HOURS * 60 * 60 * 1000,
    );

    const candidates = await this.bookingRepo.find({
      where: {
        booking_status: BookingStatus.PENDING_PAYMENT,
        created_at: LessThan(cutoff),
      },
      relations: { transaction: true },
    });

    const stale = candidates.filter((b) => {
      if (b.transaction?.paymentProvider === 'paygate') {
        return b.created_at < paygateCutoff;
      }
      return true;
    });

    if (stale.length === 0) return;

    for (const b of stale) {
      b.booking_status = BookingStatus.CANCELLED;
    }

    await this.bookingRepo.save(stale);
    this.logger.log(
      `Auto-cancelled ${stale.length} stale pending booking(s) (30 min, or ${PaygateReconciliationService.MAX_AGE_HOURS}h for PayGate)`,
    );
  }

  /**
   * Runs every minute. Finds CONFIRMED bookings starting in ~15 minutes and
   * sends a reminder push + in-app notification to both the client and the
   * provider — once per booking, ever (Redis-claimed by booking id, same
   * building block as the cron lock above, just keyed per-booking instead of
   * per-job so re-running this method never double-sends).
   */
  @Cron('* * * * *')
  async sendUpcomingAppointmentReminders(): Promise<void> {
    if (!(await this.redis.acquireLock('cron:send-reminders', 50))) return;

    const now = new Date();
    // A couple of minutes of slack around the target: the cron runs once a
    // minute, so this comfortably catches every booking exactly once without
    // needing sub-minute precision.
    const windowStart = new Date(now.getTime() + (REMINDER_MINUTES_BEFORE - 1) * 60_000);
    const windowEnd = new Date(now.getTime() + (REMINDER_MINUTES_BEFORE + 1) * 60_000);

    const candidates = await this.bookingRepo.find({
      where: { booking_status: BookingStatus.CONFIRMED },
    });

    for (const b of candidates) {
      if (!b.booking_date || !b.booking_time) continue;
      const scheduledAt = new Date(
        `${b.booking_date}T${b.booking_time.toISOString().slice(11, 19)}`,
      );
      if (scheduledAt < windowStart || scheduledAt > windowEnd) continue;

      // Claim this booking's reminder slot (24h TTL — plenty to cover the
      // lead-up window; irrelevant afterwards since the booking has passed).
      const claimed = await this.redis.acquireLock(`reminder-sent:${b.id}`, 24 * 60 * 60);
      if (!claimed) continue;

      await this.sendReminder(b);
    }
  }

  private async sendReminder(b: Bookings): Promise<void> {
    try {
      const service = await this.servicesRepo.findOne({ where: { id: b.service_id } });
      const serviceName = service?.name ?? 'votre service';
      const timeStr = b.booking_time.toISOString().slice(11, 16);

      const client = await this.usersRepo.findOne({ where: { id: b.user_id } });
      if (client) {
        await this.notificationRepo.save({
          user_id: client.id,
          type: 'appointment_reminder',
          title: 'Rendez-vous dans 15 minutes',
          body: `${serviceName} à ${timeStr}. Préparez-vous !`,
          is_read: false,
        });
        if (client.fcm_token) {
          await this.notificationsService.sendPushNotification({
            token: client.fcm_token,
            title: 'Rendez-vous dans 15 minutes',
            body: `${serviceName} à ${timeStr}. Préparez-vous !`,
            data: { type: 'appointment_reminder', bookingId: String(b.id) },
          });
        }
      }

      const shop = await this.shopsRepo.findOne({ where: { id: b.provider_id } });
      if (shop) {
        const clientName = client ? `${client.firstname} ${client.lastname}`.trim() : 'Un client';
        if (shop.fcm_token) {
          await this.notificationsService.sendPushNotification({
            token: shop.fcm_token,
            title: 'Client dans 15 minutes',
            body: `${clientName} arrive à ${timeStr} pour ${serviceName}.`,
            data: { type: 'appointment_reminder', bookingId: String(b.id) },
          });
        }
        if (shop.user_id) {
          await this.notificationRepo.save({
            user_id: shop.user_id,
            type: 'appointment_reminder',
            title: 'Client dans 15 minutes',
            body: `${clientName} arrive à ${timeStr} pour ${serviceName}.`,
            is_read: false,
          });
        }
      }

      this.logger.log(`Sent 15-min reminder for booking #${b.id}`);
    } catch (err) {
      this.logger.error(
        `Failed to send reminder for booking #${b.id}: ${err?.message ?? err}`,
      );
    }
  }
}
