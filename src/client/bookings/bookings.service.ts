import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Bookings } from './bookings.entity';
import { CreateBookingDto } from './dtos/create-booking.dto';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Bookings)
    private readonly bookingRepo: Repository<Bookings>,
  ) {}

  // 1️⃣ Create Booking (status = 0)
 async createBooking(data: CreateBookingDto) {
  const booking = this.bookingRepo.create({
    user_id: data.user_id,
    provider_id: data.provider_id,
    service_id: data.service_id,

    booking_date: new Date(data.booking_date),   // convert string -> Date
    booking_time: new Date(`1970-01-01T${data.booking_time}:00`), // convert "14:00" -> Date

    payement_status: 0,
    booking_status: 0,
  });

    return await this.bookingRepo.save(booking);
  }

  // 2️⃣ Update payment status to 1
  async updatePaymentStatus(id: number) {
    await this.bookingRepo.update(id, { payement_status: 1, booking_status: 1 });

    return this.bookingRepo.findOne({ where: { id } });
  }

  // 3️⃣ User history by date range
  async userHistory(user_id: string, start: Date, end: Date) {
    return await this.bookingRepo.find({
      where: {
        user_id,
        booking_date: Between(start, end),
      },
      order: { booking_date: 'DESC' },
    });
  }

  // 4️⃣ Admin dashboard (all bookings)
  async findAll() {
    return await this.bookingRepo.find();
  }

  // 5️⃣ Provider bookings
  async findByProvider(provider_id: string) {
    return await this.bookingRepo.find({
      where: { provider_id },
      order: { booking_date: 'DESC' },
    });
  }
}
