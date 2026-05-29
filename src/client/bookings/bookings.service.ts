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
import { BookingStatus } from './booking-status.constants';
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
  ) {}

  // ── helpers ──

  private generateToken(): string {
    return crypto.randomUUID().replace(/-/g, '');
  }

  /** Enrich a booking with service + shop data for the mobile app */
  private async enrichBooking(booking: Bookings) {
    const service = await this.serviceRepo.findOne({
      where: { id: booking.service_id },
    });
    const shop = service?.provider_id
      ? await this.shopRepo.findOne({ where: { id: service.provider_id } })
      : null;

    return {
      ...booking,
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

    const upcoming = all.filter(
      (b) =>
        b.booking_status === BookingStatus.CONFIRMED ||
        b.booking_status === BookingStatus.IN_SERVICE,
    );
    const finished = all.filter(
      (b) => b.booking_status === BookingStatus.DONE,
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
      booking.booking_status !== BookingStatus.PENDING_PAYMENT
    ) {
      throw new BadRequestException(
        'Only confirmed or pending bookings can be rescheduled',
      );
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
    return await this.bookingRepo.find({
      where: {
        user_id,
        booking_date: Between(startDay, endDay),
      },
      order: { booking_date: 'DESC' },
      relations: { transaction: true },
    });
  }

  async findAll() {
    return await this.bookingRepo.find({
      relations: { transaction: true },
    });
  }

  async findByProvider(provider_id: number) {
    const bookings = await this.bookingRepo.find({
      where: { provider_id },
      order: { booking_date: 'DESC' },
      relations: { transaction: true },
    });
    return this.enrichBookings(bookings);
  }

  async findOne(id: number) {
    return await this.bookingRepo.findOne({
      where: { id },
      relations: { transaction: true },
    });
  }
}
