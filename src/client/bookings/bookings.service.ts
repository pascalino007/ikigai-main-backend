import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, DataSource } from 'typeorm';
import { Bookings } from './bookings.entity';
import { Services } from '../../services/services.entity';
import { Shops } from '../../shops/shop.entity';
import { Users } from '../../users/user.entity';
import { Worker } from '../../workers/entities/worker.entity';
import { BookingStatus, NO_SHOW_GRACE_MINUTES } from './booking-status.constants';
import { ProWalletService } from '../../providers/pro_wallet/pro_wallet.service';
import { getScheduledDateTime } from './booking-time.util';
import * as crypto from 'crypto';

/** How early a provider may check a client in relative to the booked time. */
const CHECKIN_GRACE_MINUTES = 15;

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Bookings)
    private readonly bookingRepo: Repository<Bookings>,
    @InjectRepository(Services)
    private readonly serviceRepo: Repository<Services>,
    @InjectRepository(Shops)
    private readonly shopRepo: Repository<Shops>,
    @InjectRepository(Users)
    private readonly userRepo: Repository<Users>,
    @InjectRepository(Worker)
    private readonly workerRepo: Repository<Worker>,
    private readonly proWalletService: ProWalletService,
    private readonly dataSource: DataSource,
  ) {}

  // ── helpers ──

  private generateToken(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  /** e.g. "a1b2c3d4e5f6..." -> "a1b2****ef6" — enough to correlate log lines
   *  without printing a scannable token in full. */
  private maskToken(token: string): string {
    if (!token) return '(empty)';
    if (token.length <= 8) return token;
    return `${token.slice(0, 4)}****${token.slice(-4)}`;
  }

  /** Combines booking_date (YYYY-MM-DD) with booking_time's wall-clock hour/minute. */
  /**
   * Enrich bookings with service + shop + user + worker data for mobile & provider apps.
   * Batches the lookups (one query per related table via `In(...)`, mirroring
   * `getClientele` below) instead of querying per booking — a list of N bookings
   * used to fire up to 4N sequential single-row queries.
   */
  private async enrichBookings(bookings: Bookings[]) {
    if (bookings.length === 0) return [];

    const serviceIds = [...new Set(bookings.map((b) => b.service_id).filter(Boolean))];
    const userIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean))];
    const workerIds = [...new Set(bookings.map((b) => b.worker_id).filter((id): id is number => !!id))];

    const [services, users, workers] = await Promise.all([
      serviceIds.length ? this.serviceRepo.find({ where: { id: In(serviceIds) } }) : Promise.resolve([]),
      userIds.length ? this.userRepo.find({ where: { id: In(userIds) } }) : Promise.resolve([]),
      workerIds.length ? this.workerRepo.find({ where: { id: In(workerIds) } }) : Promise.resolve([]),
    ]);

    // Shops are keyed by the *service's* provider_id, so this depends on services
    // having resolved first — the one genuinely sequential step, same as before.
    const shopIds = [...new Set(services.map((s) => s.provider_id).filter(Boolean))];
    const shops = shopIds.length ? await this.shopRepo.find({ where: { id: In(shopIds) } }) : [];

    const serviceById = new Map(services.map((s) => [s.id, s]));
    const userById = new Map(users.map((u) => [u.id, u]));
    const workerById = new Map(workers.map((w) => [w.id, w]));
    const shopById = new Map(shops.map((s) => [s.id, s]));

    return bookings.map((booking) => {
      const service = serviceById.get(booking.service_id);
      const shop = service?.provider_id ? shopById.get(service.provider_id) : undefined;
      const user = userById.get(booking.user_id);
      const worker = booking.worker_id ? workerById.get(booking.worker_id) : undefined;

      return {
        ...booking,
        service_name: service?.name ?? null,
        service_image_url: service?.imageurl ?? null,
        client_name: user ? `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim() || null : null,
        client_phone: user?.phone ?? null,
        client_image_url: user?.image ?? null,
        shop_name: shop?.name ?? null,
        worker_name: worker ? `${worker.first_name ?? ''} ${worker.last_name ?? ''}`.trim() || null : null,
        service: service
          ? {
              id: service.id,
              name: service.name,
              description: service.description,
              price: service.price,
              duration: service.duration,
              imageurl: service.imageurl,
            }
          : null,
        shop: shop
          ? {
              id: shop.id,
              name: shop.name,
              address: shop.address,
              ville: shop.ville,
              quartier: shop.quartier,
              latitude: shop.latitude,
              longitude: shop.longitude,
              profileImageUrl: shop.profileImageUrl,
              phone: shop.phone,
            }
          : null,
        user: user
          ? {
              id: user.id,
              firstname: user.firstname,
              lastname: user.lastname,
              phone: user.phone,
              email: user.email,
              image: user.image,
            }
          : null,
      };
    });
  }

  private async enrichBooking(booking: Bookings) {
    const [enriched] = await this.enrichBookings([booking]);
    return enriched;
  }

  // ── user bookings by status group ──

  /**
   * Returns bookings for a user split into upcoming / finished / cancelled.
   * - upcoming:  status 1 (confirmed) or 4 (in_service)
   * - finished:  status 5 (done)
   * - cancelled: status 2
   */
  async userBookingsByStatus(userId: number) {
    const all = await this.bookingRepo.find({
      where: { user_id: userId },
      order: { booking_date: 'DESC', booking_time: 'DESC' },
    });

    const now = new Date();
    const toUpdate: Bookings[] = [];

    for (const b of all) {
      if (b.booking_status === BookingStatus.CONFIRMED && b.booking_date) {
        const bookingDateTime = getScheduledDateTime(b);
        if (now.getTime() - bookingDateTime.getTime() > NO_SHOW_GRACE_MINUTES * 60_000) {
          b.booking_status = BookingStatus.NO_SHOW;
          toUpdate.push(b);
        }
      }
    }

    if (toUpdate.length > 0) {
      await this.bookingRepo.save(toUpdate);
    }

    const upcoming = all.filter(
      (b) =>
        b.booking_status === BookingStatus.CONFIRMED ||
        b.booking_status === BookingStatus.IN_SERVICE,
    );
    const finished = all.filter(
      (b) =>
        b.booking_status === BookingStatus.DONE ||
        b.booking_status === BookingStatus.NO_SHOW,
    );
    const cancelled = all.filter(
      (b) => b.booking_status === BookingStatus.CANCELLED,
    );

    return {
      upcoming: await this.enrichBookings(upcoming),
      finished: await this.enrichBookings(finished),
      cancelled: await this.enrichBookings(cancelled),
    };
  }

  // ── reschedule ──

  async reschedule(
    bookingId: number,
    userId: number,
    newDate: string,
    newTime: string,
  ) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId, user_id: userId },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (
      booking.booking_status !== BookingStatus.CONFIRMED &&
      booking.booking_status !== BookingStatus.PENDING_PAYMENT &&
      booking.booking_status !== BookingStatus.NO_SHOW
    ) {
      throw new BadRequestException(
        'Only confirmed, pending or missed bookings can be rescheduled',
      );
    }
    // When rescheduling a missed booking, restore it to confirmed
    if (booking.booking_status === BookingStatus.NO_SHOW) {
      booking.booking_status = BookingStatus.CONFIRMED;
    }

    booking.booking_date = newDate;
    booking.booking_time = new Date(`${newDate}T${newTime}:00`);
    // Issue a fresh single-use check-in token so any previously shown QR is void.
    booking.qr_checkin_token = this.generateToken();
    await this.bookingRepo.save(booking);
    return this.enrichBooking(booking);
  }

  // ── QR check-in (provider scans client QR → start service) ──

  async qrCheckin(token: string, authUserId: number) {
    this.logger.log(
      `[qrCheckin] attempt by authUserId=${authUserId} token=${this.maskToken(token)}`,
    );
    const booking = await this.dataSource.transaction(async (manager) => {
      // Lock the row so a double-scan can't transition it twice.
      const b = await manager.findOne(Bookings, {
        where: { qr_checkin_token: token },
        lock: { mode: 'pessimistic_write' },
      });
      if (!b) {
        this.logger.warn(
          `[qrCheckin] no booking matches token=${this.maskToken(token)} (authUserId=${authUserId}) — already consumed, wrong QR, or expired`,
        );
        throw new NotFoundException('Invalid check-in QR code');
      }
      this.logger.log(
        `[qrCheckin] token matched booking #${b.id} (status=${b.booking_status}, provider_id=${b.provider_id})`,
      );

      // Authorization: only the booking's shop owner may check it in.
      const shop = await manager.findOne(Shops, { where: { id: b.provider_id } });
      if (!shop || shop.user_id !== authUserId) {
        this.logger.warn(
          `[qrCheckin] booking #${b.id}: authUserId=${authUserId} does not own shop ${b.provider_id} (shop.user_id=${shop?.user_id ?? '(shop not found)'})`,
        );
        throw new ForbiddenException('You are not allowed to check in this booking');
      }

      if (b.booking_status !== BookingStatus.CONFIRMED) {
        this.logger.warn(
          `[qrCheckin] booking #${b.id}: wrong status ${b.booking_status}, expected CONFIRMED(${BookingStatus.CONFIRMED})`,
        );
        throw new BadRequestException(
          `Booking is not in confirmed state (current: ${b.booking_status})`,
        );
      }

      // Refuse to start the service before the booked time (minus a small
      // grace window) — otherwise scheduling/ordering has no meaning.
      const scheduledAt = getScheduledDateTime(b);
      const earliestAllowed = new Date(
        scheduledAt.getTime() - CHECKIN_GRACE_MINUTES * 60_000,
      );
      const now = new Date();
      if (now < earliestAllowed) {
        const minutesRemaining = Math.ceil(
          (scheduledAt.getTime() - now.getTime()) / 60_000,
        );
        this.logger.warn(
          `[qrCheckin] booking #${b.id}: too early, ${minutesRemaining}min remaining (scheduledAt=${scheduledAt.toISOString()})`,
        );
        throw new BadRequestException({
          error: 'too_early',
          message: `Le rendez-vous n'a pas encore commencé. Il reste ${minutesRemaining} minute(s).`,
          scheduledAt: scheduledAt.toISOString(),
          minutesRemaining,
        });
      }

      b.booking_status = BookingStatus.IN_SERVICE;
      b.checked_in_at = new Date();
      // Generate the checkout token now; consume the check-in token (single-use).
      const checkoutToken = this.generateToken();
      b.qr_checkout_token = checkoutToken;
      b.qr_checkin_token = null;
      await manager.save(Bookings, b);
      this.logger.log(
        `[qrCheckin] booking #${b.id} checked in — new checkout token=${this.maskToken(checkoutToken)}`,
      );

      // The assigned worker is now serving a client → mark them busy.
      if (b.worker_id) {
        await manager.update(Worker, b.worker_id, { status: 'occupé' });
      }
      return b;
    });

    return this.enrichBooking(booking);
  }

  // ── QR check-out (client scans provider QR → end service) ──

  async qrCheckout(token: string, authUserId: number) {
    this.logger.log(
      `[qrCheckout] attempt by authUserId=${authUserId} token=${this.maskToken(token)}`,
    );
    const booking = await this.dataSource.transaction(async (manager) => {
      const b = await manager.findOne(Bookings, {
        where: { qr_checkout_token: token },
        lock: { mode: 'pessimistic_write' },
      });
      if (!b) {
        this.logger.warn(
          `[qrCheckout] no booking matches token=${this.maskToken(token)} (authUserId=${authUserId}) — already consumed, wrong QR, or check-in never happened`,
        );
        throw new NotFoundException('Invalid check-out QR code');
      }
      this.logger.log(
        `[qrCheckout] token matched booking #${b.id} (status=${b.booking_status}, user_id=${b.user_id})`,
      );

      // Authorization: only the client who owns the booking may check it out.
      if (b.user_id !== authUserId) {
        this.logger.warn(
          `[qrCheckout] booking #${b.id}: authUserId=${authUserId} does not match booking.user_id=${b.user_id}`,
        );
        throw new ForbiddenException('You are not allowed to check out this booking');
      }

      if (b.booking_status !== BookingStatus.IN_SERVICE) {
        this.logger.warn(
          `[qrCheckout] booking #${b.id}: wrong status ${b.booking_status}, expected IN_SERVICE(${BookingStatus.IN_SERVICE})`,
        );
        throw new BadRequestException(
          `Booking is not in IN_SERVICE state (current: ${b.booking_status})`,
        );
      }

      b.booking_status = BookingStatus.DONE;
      b.checked_out_at = new Date();
      b.qr_checkout_token = null; // single-use
      await manager.save(Bookings, b);
      this.logger.log(`[qrCheckout] booking #${b.id} checked out successfully`);

      // Service finished → the worker is free again.
      if (b.worker_id) {
        await manager.update(Worker, b.worker_id, { status: 'libre' });
      }
      return b;
    });
    // Wallet is credited automatically by BookingsSubscriber (on the save above).

    return this.enrichBooking(booking);
  }

  // ── generate QR tokens for a booking (called after payment confirmed) ──

  async ensureQrTokens(bookingId: number): Promise<Bookings> {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    if (!booking.qr_checkin_token) {
      booking.qr_checkin_token = this.generateToken();
      await this.bookingRepo.save(booking);
    }
    return booking;
  }

  // ── legacy / existing methods ──

  async userHistory(user_id: number, start: Date, end: Date) {
    const startDay = start.toISOString().slice(0, 10);
    const endDay = end.toISOString().slice(0, 10);
    const bookings = await this.bookingRepo.find({
      where: {
        user_id,
        booking_date: Between(startDay, endDay),
      },
      order: { booking_date: 'DESC' },
      relations: { transactions: true },
    });
    return this.enrichBookings(bookings);
  }

  async findAll(query: { page?: number; limit?: number; startDate?: string; endDate?: string }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (query.startDate && query.endDate) {
      where.booking_date = Between(query.startDate, query.endDate);
    }

    const [bookings, total] = await this.bookingRepo.findAndCount({
      where,
      order: { booking_date: 'DESC', booking_time: 'DESC' },
      relations: { transactions: true },
      skip,
      take: limit,
    });

    return {
      data: await this.enrichBookings(bookings),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByProvider(
    provider_id: number,
    query: { page?: number; limit?: number; startDate?: string; endDate?: string },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: any = { provider_id };
    if (query.startDate && query.endDate) {
      where.booking_date = Between(query.startDate, query.endDate);
    }

    const [bookings, total] = await this.bookingRepo.findAndCount({
      where,
      order: { booking_date: 'DESC', booking_time: 'DESC' },
      relations: { transactions: true },
      skip,
      take: limit,
    });

    const now = new Date();
    const toUpdate: Bookings[] = [];

    for (const b of bookings) {
      if (b.booking_status === BookingStatus.CONFIRMED && b.booking_date) {
        const bookingDateTime = getScheduledDateTime(b);
        if (now.getTime() - bookingDateTime.getTime() > NO_SHOW_GRACE_MINUTES * 60_000) {
          b.booking_status = BookingStatus.NO_SHOW;
          toUpdate.push(b);
        }
      }
    }

    if (toUpdate.length > 0) {
      await this.bookingRepo.save(toUpdate);
    }

    return {
      data: await this.enrichBookings(bookings),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * "Ma clientèle": every client who has booked with this provider, with their
   * bookings, total revenue (completed bookings) and last booking.
   */
  async getClientele(provider_id: number): Promise<any[]> {
    const bookings = await this.bookingRepo.find({
      where: { provider_id },
      order: { booking_date: 'DESC', booking_time: 'DESC' },
    });
    if (bookings.length === 0) return [];

    const userIds = [...new Set(bookings.map((b) => b.user_id).filter(Boolean))];
    const serviceIds = [...new Set(bookings.map((b) => b.service_id).filter(Boolean))];

    const users = userIds.length
      ? await this.userRepo.find({ where: { id: In(userIds) } })
      : [];
    const userById = new Map(users.map((u) => [u.id, u]));
    const services = serviceIds.length
      ? await this.serviceRepo.find({ where: { id: In(serviceIds) } })
      : [];
    const serviceNameById = new Map(services.map((s) => [s.id, s.name]));

    const byUser = new Map<number, Bookings[]>();
    for (const b of bookings) {
      const arr = byUser.get(b.user_id) ?? [];
      arr.push(b);
      byUser.set(b.user_id, arr);
    }

    const result: any[] = [];
    for (const [userId, list] of byUser) {
      const user = userById.get(userId);
      const clientName = user
        ? `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim()
        : '';
      const totalRevenue = list
        .filter((b) => b.booking_status === BookingStatus.DONE)
        .reduce((sum, b) => sum + (b.amount || 0), 0);
      const last = list[0]; // list is sorted DESC

      result.push({
        user_id: userId,
        client_name: clientName || `Client #${userId}`,
        client_phone: user?.phone ?? null,
        client_image_url: user?.image ?? null,
        total_bookings: list.length,
        total_revenue: totalRevenue,
        currency: 'XOF',
        last_booking_date: last?.booking_date ?? null,
        bookings: list.map((b) => ({
          id: b.id,
          service_id: b.service_id,
          service_name: serviceNameById.get(b.service_id) ?? null,
          booking_date: b.booking_date,
          booking_time: b.booking_time,
          booking_status: b.booking_status,
          amount: b.amount,
          currency: b.currency,
        })),
      });
    }

    // Best clients first (highest revenue).
    result.sort((a, b) => b.total_revenue - a.total_revenue);
    return result;
  }

  async findOne(id: number) {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: { transactions: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    // Auto-convert passed confirmed bookings to NO_SHOW
    if (booking.booking_status === BookingStatus.CONFIRMED && booking.booking_date) {
      const now = new Date();
      const bookingDateTime = getScheduledDateTime(booking);
      if (now.getTime() - bookingDateTime.getTime() > NO_SHOW_GRACE_MINUTES * 60_000) {
        booking.booking_status = BookingStatus.NO_SHOW;
        await this.bookingRepo.save(booking);
      }
    }

    return this.enrichBooking(booking);
  }

  // ── Provider cancels a booking ──

  async cancel(id: number, providerId: number) {
    const booking = await this.bookingRepo.findOne({
      where: { id },
      relations: { transactions: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.provider_id !== providerId) {
      throw new BadRequestException('This booking does not belong to your shop');
    }
    if (
      booking.booking_status !== BookingStatus.CONFIRMED &&
      booking.booking_status !== BookingStatus.PENDING_PAYMENT &&
      booking.booking_status !== BookingStatus.NO_SHOW
    ) {
      throw new BadRequestException(
        'Only confirmed, pending or no-show bookings can be cancelled',
      );
    }

    booking.booking_status = BookingStatus.CANCELLED;
    await this.bookingRepo.save(booking);
    return this.enrichBooking(booking);
  }

  /** Admin dashboard: total bookings count (optionally filtered by date range) */
  async count(startDate?: string, endDate?: string): Promise<number> {
    const where: any = {};
    if (startDate && endDate) {
      where.booking_date = Between(startDate, endDate);
    }
    return this.bookingRepo.count({ where });
  }

  /** Admin dashboard: total revenue from completed bookings (optionally filtered by date range) */
  async getRevenue(startDate?: string, endDate?: string): Promise<number> {
    const where: any = { booking_status: BookingStatus.DONE };
    if (startDate && endDate) {
      where.booking_date = Between(startDate, endDate);
    }
    const bookings = await this.bookingRepo.find({ where, select: ['amount'] });
    return bookings.reduce((sum, b) => sum + (b.amount || 0), 0);
  }
}
