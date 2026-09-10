import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChatMessage } from './chat-message.entity';
import { Users } from '../users/user.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Notification } from '../notifications/notification.entity';

export interface ConversationSummary {
  user_id: number;
  user_name: string;
  user_image: string | null;
  last_message: string;
  last_sender: string;
  last_at: Date;
  unread_count: number;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    @InjectRepository(ChatMessage)
    private readonly chatRepo: Repository<ChatMessage>,
    @InjectRepository(Users)
    private readonly usersRepo: Repository<Users>,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** A client sends a message from the mobile app. */
  async sendUserMessage(userId: number, message: string): Promise<ChatMessage> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const row = this.chatRepo.create({
      user_id: userId,
      user_name: `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim() || 'Client',
      user_image: user.image || null,
      sender: 'user',
      admin_name: null,
      message,
      is_read: false,
    });
    return this.chatRepo.save(row);
  }

  /** An admin replies to a client's conversation from the dashboard. Pushes a
   *  Firebase notification (with sound) to the client's device right away. */
  async sendAdminReply(
    userId: number,
    message: string,
    adminName?: string,
  ): Promise<ChatMessage> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const row = this.chatRepo.create({
      user_id: userId,
      user_name: `${user.firstname ?? ''} ${user.lastname ?? ''}`.trim() || 'Client',
      user_image: user.image || null,
      sender: 'admin',
      admin_name: adminName || 'Service Client',
      message,
      is_read: false,
    });
    const saved = await this.chatRepo.save(row);

    // In-app notification history (shows up in the client's notification list too).
    try {
      const notif = this.notificationRepo.create({
        user_id: userId,
        type: 'chat',
        title: adminName || 'Service Client',
        body: message,
        image_url: null,
        is_read: false,
      });
      await this.notificationRepo.save(notif);
    } catch (err: any) {
      this.logger.warn(`Failed to persist chat notification row: ${err.message}`);
    }

    // Push notification (with sound, per NotificationsService's android/apns config).
    if (user.fcm_token) {
      await this.notificationsService.sendPushNotification({
        token: user.fcm_token,
        title: adminName || 'Service Client',
        body: message,
        data: { type: 'chat' },
      });
    } else {
      this.logger.warn(`No fcm_token for user ${userId}; skipped push for chat reply`);
    }

    return saved;
  }

  /** Full thread for one client, oldest first. */
  async getThread(userId: number): Promise<ChatMessage[]> {
    return this.chatRepo.find({
      where: { user_id: userId },
      order: { created_at: 'ASC' },
    });
  }

  /** Client opened the chat: their unread admin replies are now read. */
  async markReadByUser(userId: number): Promise<void> {
    await this.chatRepo.update(
      { user_id: userId, sender: 'admin', is_read: false },
      { is_read: true },
    );
  }

  /** Admin opened this conversation: the client's unread messages are now read. */
  async markReadByAdmin(userId: number): Promise<void> {
    await this.chatRepo.update(
      { user_id: userId, sender: 'user', is_read: false },
      { is_read: true },
    );
  }

  /** One row per client, most recently active first, for the admin inbox. */
  async getConversations(): Promise<ConversationSummary[]> {
    const messages = await this.chatRepo.find({ order: { created_at: 'DESC' } });
    const byUser = new Map<number, ConversationSummary>();

    for (const m of messages) {
      let convo = byUser.get(m.user_id);
      if (!convo) {
        convo = {
          user_id: m.user_id,
          user_name: m.user_name,
          user_image: m.user_image,
          last_message: m.message,
          last_sender: m.sender,
          last_at: m.created_at,
          unread_count: 0,
        };
        byUser.set(m.user_id, convo);
      }
      if (m.sender === 'user' && !m.is_read) convo.unread_count += 1;
    }

    return Array.from(byUser.values()).sort(
      (a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime(),
    );
  }

  /** Total unread-from-clients count, for the sidebar badge. */
  async getUnreadCount(): Promise<number> {
    return this.chatRepo.count({ where: { sender: 'user', is_read: false } });
  }
}
