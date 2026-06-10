import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Body,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';

@Controller('notifications')
export class NotificationsController {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
  ) {}

  /** Get all notifications for a user, newest first. */
  @Get('user/:userId')
  async getUserNotifications(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<Notification[]> {
    return this.notificationRepo.find({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  /** Mark a notification as read. */
  @Post(':id/read')
  async markAsRead(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<Notification> {
    const notif = await this.notificationRepo.findOne({ where: { id } });
    if (!notif) {
      throw new Error('Notification not found');
    }
    notif.is_read = true;
    return this.notificationRepo.save(notif);
  }

  /** Mark all notifications as read for a user. */
  @Post('user/:userId/read-all')
  async markAllAsRead(
    @Param('userId', ParseIntPipe) userId: number,
  ): Promise<{ affected: number }> {
    const result = await this.notificationRepo.update(
      { user_id: userId, is_read: false },
      { is_read: true },
    );
    return { affected: result.affected ?? 0 };
  }
}
