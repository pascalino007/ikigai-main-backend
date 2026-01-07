import { Controller, Post, Body, Param, Patch, Get, Query } from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dtos/create-booking.dto';
import { UserHistoryDto } from './dtos/userhistory.dto';


@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingService: BookingsService) {}

  @Post()
  create(@Body() body: CreateBookingDto) {
    return this.bookingService.createBooking(body);
  }

  @Patch(':id/pay')
  pay(@Param('id') id: number) {
    return this.bookingService.updatePaymentStatus(id);
  }

  @Get('history/:user_id')
  userHistory(
    @Param('user_id') user_id: string,
    @Query() query: UserHistoryDto,
  ) {
    return this.bookingService.userHistory(
      user_id,
      new Date(query.start),
      new Date(query.end),
    );
  }

  @Get()
  findAll() {
    return this.bookingService.findAll();
  }

  @Get('provider/:provider_id')
  providerBookings(@Param('provider_id') provider_id: string) {
    return this.bookingService.findByProvider(provider_id);
  }
}
