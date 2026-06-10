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
import { Users } from '../users/user.entity';
import { Shops } from '../shops/shop.entity';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(Users)
    private readonly usersRepo: Repository<Users>,
    @InjectRepository(Shops)
    private readonly shopsRepo: Repository<Shops>,
    private readonly notificationsService: NotificationsService,
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

  /** Broadcast push notification to clients, providers, or both. */
  @Post('broadcast')
  async broadcast(
    @Body() body: { target: 'clients' | 'providers' | 'both'; title: string; message: string },
  ): Promise<{ sent: number; failed: number }> {
    const { target, title, message } = body;
    const tokens: string[] = [];

    if (target === 'clients' || target === 'both') {
      const users = await this.usersRepo.find({
        where: { role: 'client' },
        select: ['fcm_token'],
      });
      tokens.push(...users.map((u) => u.fcm_token).filter((t): t is string => !!t));
    }

    if (target === 'providers' || target === 'both') {
      const shops = await this.shopsRepo.find({
        select: ['fcm_token'],
      });
      tokens.push(...shops.map((s) => s.fcm_token).filter((t): t is string => !!t));
    }

    let sent = 0;
    let failed = 0;

    for (const token of tokens) {
      try {
        await this.notificationsService.sendPushNotification({
          token,
          title,
          body: message,
        });
        sent++;
      } catch (_) {
        failed++;
      }
    }

    return { sent, failed };
  }
}
