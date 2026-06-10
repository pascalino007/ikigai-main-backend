import { Module } from '@nestjs/common';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingCheckoutService } from './booking-checkout.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bookings } from './bookings.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { Services } from '../../services/services.entity';
import { Shops } from '../../shops/shop.entity';
import { Users } from '../../users/user.entity';
import { Worker } from '../../workers/entities/worker.entity';
import { ClientWallet } from '../client_wallet/client_wallet.entity';
import { PaymentsModule } from '../../payments/payments.module';
import { ProWalletModule } from '../../providers/pro_wallet/pro_wallet.module';
import { NotificationsModule } from '../../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bookings, Transaction, Services, Shops, ClientWallet, Users, Worker]),
    PaymentsModule,
    ProWalletModule,
    NotificationsModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingCheckoutService],
})
export class BookingsModule {}
