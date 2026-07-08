import {
  Injectable,
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
import { BookingStatus } from './booking-status.constants';
import { ProWalletService } from '../../providers/pro_wallet/pro_wallet.service';
import * as crypto from 'crypto';

@Injectable()
export class BookingsService {
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

  /** Enrich a booking with service + shop + user + worker data for mobile & provider apps */
  private async enrichBooking(booking: Bookings) {
    const service = await this.serviceRepo.findOne({
      where: { id: booking.service_id },
    });
    const shop = service?.provider_id
      ? await this.shopRepo.findOne({ where: { id: service.provider_id } })
      : null;
    const user = await this.userRepo.findOne({
      where: { id: booking.user_id },
    });
    const worker = booking.worker_id
      ? await this.workerRepo.findOne({ where: { id: booking.worker_id } })
      : null;

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
  }

  private async enrichBookings(bookings: Bookings[]) {
    return Promise.all(bookings.map((b) => this.enrichBooking(b)));
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
        const bookingDateTime = b.booking_time
          ? new Date(`${b.booking_date}T${b.booking_time.toISOString().slice(11, 19)}`)
          : new Date(b.booking_date);
        if (bookingDateTime < now) {
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
    const booking = await this.dataSource.transaction(async (manager) => {
      // Lock the row so a double-scan can't transition it twice.
      const b = await manager.findOne(Bookings, {
        where: { qr_checkin_token: token },
        lock: { mode: 'pessimistic_write' },
      });
      if (!b) throw new NotFoundException('Invalid check-in QR code');

      // Authorization: only the booking's shop owner may check it in.
      const shop = await manager.findOne(Shops, { where: { id: b.provider_id } });
      if (!shop || shop.user_id !== authUserId) {
        throw new ForbiddenException('You are not allowed to check in this booking');
      }

      if (b.booking_status !== BookingStatus.CONFIRMED) {
        throw new BadRequestException(
          `Booking is not in confirmed state (current: ${b.booking_status})`,
        );
      }

      b.booking_status = BookingStatus.IN_SERVICE;
      b.checked_in_at = new Date();
      // Generate the checkout token now; consume the check-in token (single-use).
      b.qr_checkout_token = this.generateToken();
      b.qr_checkin_token = null;
      await manager.save(Bookings, b);

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
    const booking = await this.dataSource.transaction(async (manager) => {
      const b = await manager.findOne(Bookings, {
        where: { qr_checkout_token: token },
        lock: { mode: 'pessimistic_write' },
      });
      if (!b) throw new NotFoundException('Invalid check-out QR code');

      // Authorization: only the client who owns the booking may check it out.
      if (b.user_id !== authUserId) {
        throw new ForbiddenException('You are not allowed to check out this booking');
      }

      if (b.booking_status !== BookingStatus.IN_SERVICE) {
        throw new BadRequestException(
          `Booking is not in IN_SERVICE state (current: ${b.booking_status})`,
        );
      }

      b.booking_status = BookingStatus.DONE;
      b.checked_out_at = new Date();
      b.qr_checkout_token = null; // single-use
      await manager.save(Bookings, b);

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
      relations: { transaction: true },
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
      relations: { transaction: true },
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
      relations: { transaction: true },
      skip,
      take: limit,
    });

    const now = new Date();
    const toUpdate: Bookings[] = [];

    for (const b of bookings) {
      if (b.booking_status === BookingStatus.CONFIRMED && b.booking_date) {
        const bookingDateTime = b.booking_time
          ? new Date(`${b.booking_date}T${b.booking_time.toISOString().slice(11, 19)}`)
          : new Date(b.booking_date);
        if (bookingDateTime < now) {
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
      relations: { transaction: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    // Auto-convert passed confirmed bookings to NO_SHOW
    if (booking.booking_status === BookingStatus.CONFIRMED && booking.booking_date) {
      const now = new Date();
      const bookingDateTime = booking.booking_time
        ? new Date(`${booking.booking_date}T${booking.booking_time.toISOString().slice(11, 19)}`)
        : new Date(booking.booking_date);
      if (bookingDateTime < now) {
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
      relations: { transaction: true },
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
