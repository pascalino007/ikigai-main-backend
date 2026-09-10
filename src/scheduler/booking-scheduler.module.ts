import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BookingSchedulerService } from './booking-scheduler.service';
import { Bookings } from '../client/bookings/bookings.entity';
import { Shops } from '../shops/shop.entity';
import { Users } from '../users/user.entity';
import { Services } from '../services/services.entity';
import { Notification } from '../notifications/notification.entity';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Bookings, Shops, Users, Services, Notification]),
    NotificationsModule,
  ],
  providers: [BookingSchedulerService],
})
export class BookingSchedulerModule {}
