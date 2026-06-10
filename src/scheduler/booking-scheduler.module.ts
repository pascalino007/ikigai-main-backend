import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingSchedulerService } from './booking-scheduler.service';
import { Bookings } from '../client/bookings/bookings.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Bookings])],
  providers: [BookingSchedulerService],
})
export class BookingSchedulerModule {}
