import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
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
    await this.bookingRepo.save(booking);
    return this.enrichBooking(booking);
  }

  // ── QR check-in (provider scans client QR → start service) ──

  async qrCheckin(token: string) {
    const booking = await this.bookingRepo.findOne({
      where: { qr_checkin_token: token },
    });
    if (!booking) throw new NotFoundException('Invalid check-in QR code');
    if (booking.booking_status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException(
        `Booking is not in confirmed state (current: ${booking.booking_status})`,
      );
    }

    booking.booking_status = BookingStatus.IN_SERVICE;
    booking.checked_in_at = new Date();
    // generate the checkout token now so provider can display it
    booking.qr_checkout_token = this.generateToken();
    await this.bookingRepo.save(booking);
    return this.enrichBooking(booking);
  }

  // ── QR check-out (client scans provider QR → end service) ──

  async qrCheckout(token: string) {
    const booking = await this.bookingRepo.findOne({
      where: { qr_checkout_token: token },
    });
    if (!booking) throw new NotFoundException('Invalid check-out QR code');
    if (booking.booking_status !== BookingStatus.IN_SERVICE) {
      throw new BadRequestException(
        `Booking is not in IN_SERVICE state (current: ${booking.booking_status})`,
      );
    }

    booking.booking_status = BookingStatus.DONE;
    booking.checked_out_at = new Date();
    await this.bookingRepo.save(booking);
    // Wallet is credited automatically by BookingsSubscriber

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
