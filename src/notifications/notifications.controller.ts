import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Body,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification } from './notification.entity';
import { Users } from '../users/user.entity';
import { Shops } from '../shops/shop.entity';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  private readonly logger = new Logger(NotificationsController.name);

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
    @Body() body: { target: 'clients' | 'providers' | 'both'; title: string; message: string; imageUrl?: string },
  ): Promise<{ sent: number; failed: number }> {
    const { target, title, message, imageUrl } = body;
    const tokens: string[] = [];

    if (target === 'clients' || target === 'both') {
      const users = await this.usersRepo.find({
        where: { role: 'client' },
        select: ['fcm_token'],
      });
      const clientTokens = users.map((u) => u.fcm_token).filter((t): t is string => !!t);
      this.logger.log(`Broadcast [clients]: ${users.length} users found, ${clientTokens.length} with tokens`);
      tokens.push(...clientTokens);
    }

    if (target === 'providers' || target === 'both') {
      const shops = await this.shopsRepo.find({
        select: ['fcm_token'],
      });
      const providerTokens = shops.map((s) => s.fcm_token).filter((t): t is string => !!t);
      this.logger.log(`Broadcast [providers]: ${shops.length} shops found, ${providerTokens.length} with tokens`);
      tokens.push(...providerTokens);
    }

    this.logger.log(`Broadcast total tokens: ${tokens.length}`);

    let sent = 0;
    let failed = 0;

    for (const token of tokens) {
      try {
        await this.notificationsService.sendPushNotification({
          token,
          title,
          body: message,
          data: imageUrl ? { imageUrl } : undefined,
        });
        sent++;
      } catch (err: any) {
        this.logger.error(`Push failed for token: ${err.message}`);
        failed++;
      }
    }

    // Persist notifications in DB for history
    if (target === 'clients' || target === 'both') {
      const users = await this.usersRepo.find({
        where: { role: 'client' },
        select: ['id'],
      });
      for (const user of users) {
        const notif = this.notificationRepo.create({
          user_id: user.id,
          type: 'broadcast',
          title,
          body: message,
          image_url: imageUrl || null,
          is_read: false,
        });
        await this.notificationRepo.save(notif);
      }
    }

    if (target === 'providers' || target === 'both') {
      const shops = await this.shopsRepo.find({
        select: ['user_id'],
      });
      for (const shop of shops) {
        if (!shop.user_id) continue;
        const notif = this.notificationRepo.create({
          user_id: shop.user_id,
          type: 'broadcast',
          title,
          body: message,
          image_url: imageUrl || null,
          is_read: false,
        });
        await this.notificationRepo.save(notif);
      }
    }

    return { sent, failed };
  }

  /** Get all notifications for admin history (newest first). */
  @Get()
  async getAllNotifications(): Promise<Notification[]> {
    return this.notificationRepo.find({
      order: { created_at: 'DESC' },
      take: 50,
    });
  }
}
