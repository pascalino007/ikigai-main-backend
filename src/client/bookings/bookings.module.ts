import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bookings } from './bookings.entity';

@Module({
  imports:[TypeOrmModule.forFeature([Bookings])],
  controllers: [BookingsController],
  providers: [BookingsService]
})
export class BookingsModule {}
