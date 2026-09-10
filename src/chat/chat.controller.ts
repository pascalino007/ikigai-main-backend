import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ── Mobile app (the client) — authenticated via the bearer JWT ──────────

  /** Client sends a message. */
  @UseGuards(JwtAuthGuard)
  @Post('messages')
  sendMessage(@Req() req: any, @Body() body: { message: string }) {
    return this.chatService.sendUserMessage(req.user.id, body.message);
  }

  /** Client's own thread. Opening it marks the admin's replies as read. */
  @UseGuards(JwtAuthGuard)
  @Get('messages')
  async getMyThread(@Req() req: any) {
    const thread = await this.chatService.getThread(req.user.id);
    await this.chatService.markReadByUser(req.user.id);
    return thread;
  }

  // ── Admin dashboard — no user-facing JWT, matches the rest of the /admin
  //    surface (categories, sliders, songs, …), which is likewise unguarded
  //    and relies on the dashboard's own login gate. ─────────────────────

  /** One row per client conversation, most recent first, with unread counts. */
  @Get('admin/conversations')
  getConversations() {
    return this.chatService.getConversations();
  }

  /** Badge count: total unread client messages across all conversations. */
  @Get('admin/unread-count')
  async getUnreadCount() {
    return { count: await this.chatService.getUnreadCount() };
  }

  /** One client's full thread. Opening it marks their messages as read. */
  @Get('admin/messages/:userId')
  async getThread(@Param('userId', ParseIntPipe) userId: number) {
    const thread = await this.chatService.getThread(userId);
    await this.chatService.markReadByAdmin(userId);
    return thread;
  }

  /** Admin replies — persists the message and pushes a Firebase notification
   *  (with sound) to the client's device. */
  @Post('admin/messages/:userId/reply')
  reply(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() body: { message: string; adminName?: string },
  ) {
    return this.chatService.sendAdminReply(userId, body.message, body.adminName);
  }
}
