import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingSchedulerService } from './booking-scheduler.service';
import { PaygateReconciliationService } from './paygate-reconciliation.service';
import { Bookings } from '../client/bookings/bookings.entity';
import { Shops } from '../shops/shop.entity';
import { Users } from '../users/user.entity';
import { Services } from '../services/services.entity';
import { Notification } from '../notifications/notification.entity';
import { Transaction } from '../transaction/transaction.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bookings, Shops, Users, Services, Notification, Transaction]),
    NotificationsModule,
    PaymentsModule,
  ],
  providers: [BookingSchedulerService, PaygateReconciliationService],
})
export class BookingSchedulerModule {}
