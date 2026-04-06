import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingCheckoutService } from './booking-checkout.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bookings } from './bookings.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { Services } from '../../services/services.entity';
import { Shops } from '../../shops/shop.entity';
import { ClientWallet } from '../client_wallet/client_wallet.entity';
import { PaymentsModule } from '../../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bookings, Transaction, Services, Shops, ClientWallet]),
    PaymentsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingCheckoutService],
})
export class BookingsModule {}
