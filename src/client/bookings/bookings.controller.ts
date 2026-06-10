import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { BookingCheckoutService } from './booking-checkout.service';
import { InitiateBookingCheckoutDto } from './dtos/initiate-booking-checkout.dto';
import { BulkBookingCheckoutDto } from './dtos/bulk-booking-checkout.dto';
import { UserHistoryDto } from './dtos/userhistory.dto';

@Controller('bookings')
export class BookingsController {
  constructor(
    private readonly bookingService: BookingsService,
    private readonly bookingCheckoutService: BookingCheckoutService,
  ) {}

  /**
   * Creates a pending booking and a pending transaction; client completes payment with the aggregator.
   * Booking becomes confirmed only after a successful webhook.
   */
  @Post('checkout')
  checkout(@Body() body: InitiateBookingCheckoutDto) {
    return this.bookingCheckoutService.initiateCheckout(body);
  }

  /**
   * Bulk checkout — pay multiple bookings (a cart) in ONE payment.
   * Wallet: single atomic debit equal to the total of all services.
   * External (Stripe/Kkiapay): one payment intent for the total. All bookings
   * are confirmed (or failed) together when the webhook arrives.
   * Every booking is registered individually and appears separately in
   * bookings & transactions.
   */
  @Post('checkout/bulk')
  bulkCheckout(@Body() body: BulkBookingCheckoutDto) {
    return this.bookingCheckoutService.initiateBulkCheckout(body);
  }

  /** Mobile: get user bookings grouped by upcoming / finished / cancelled */
  @Get('user/:user_id/status')
  userBookingsByStatus(@Param('user_id', ParseIntPipe) userId: number) {
    return this.bookingService.userBookingsByStatus(userId);
  }

  /** Mobile: reschedule a booking to a new date/time */
  @Patch(':id/reschedule')
  reschedule(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { userId: number; newDate: string; newTime: string },
  ) {
    return this.bookingService.reschedule(id, body.userId, body.newDate, body.newTime);
  }

  /** Provider scans client QR → start service */
  @Post('qr/checkin')
  qrCheckin(@Body() body: { token: string }) {
    return this.bookingService.qrCheckin(body.token);
  }

  /** Client scans provider QR → end service */
  @Post('qr/checkout')
  qrCheckout(@Body() body: { token: string }) {
    return this.bookingService.qrCheckout(body.token);
  }

  @Get('history/:user_id')
  userHistory(
    @Param('user_id', ParseIntPipe) user_id: number,
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
  providerBookings(
    @Param('provider_id', ParseIntPipe) provider_id: number,
  ) {
    return this.bookingService.findByProvider(provider_id);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.bookingService.findOne(id);
  }

  /** Provider cancels a booking */
  @Post(':id/cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body('provider_id', ParseIntPipe) providerId: number,
  ) {
    return this.bookingService.cancel(id, providerId);
  }
}
