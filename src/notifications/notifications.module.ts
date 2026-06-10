import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { Notification } from './notification.entity';
import { Users } from '../users/user.entity';
import { Shops } from '../shops/shop.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, Users, Shops])],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
