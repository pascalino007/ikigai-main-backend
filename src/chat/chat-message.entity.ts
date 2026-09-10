import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * One message in a client <-> admin support conversation. Every conversation
 * is keyed by `user_id` (the client) — both the client's own messages and the
 * admin's replies to them live under the same `user_id`, distinguished by
 * `sender`. The client's name/image are snapshotted onto every row (not just
 * looked up via a join) so the admin inbox can render instantly without an
 * extra query, and so history still reads correctly if the user later
 * changes their name or photo.
 */
@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn()
  id: number;

  /** The client this conversation belongs to (same on every row of the thread). */
  @Column()
  @Index()
  user_id: number;

  /** Snapshot of the client's display name at the time this row was written. */
  @Column()
  user_name: string;

  /** Snapshot of the client's profile image URL at the time this row was written. */
  @Column({ type: 'text', nullable: true })
  user_image: string | null;

  /** Who sent this message: 'user' (the client) or 'admin' (support staff). */
  @Column()
  sender: string;

  /** Display name of the admin/agent who sent it, when sender = 'admin'. */
  @Column({ type: 'text', nullable: true })
  admin_name: string | null;

  @Column({ type: 'text' })
  message: string;

  /** Read by the *other* side: a user-sent message is read once the admin
   *  opens the conversation; an admin-sent message is read once the client
   *  opens the chat page. */
  @Column({ default: false })
  is_read: boolean;

  @CreateDateColumn()
  created_at: Date;
}
