import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * A long-lived credential that lets the client silently mint a new short-lived
 * access token without asking the user to log in again — as long as they've
 * opened the app at least once within its own (much longer) lifetime.
 * Single-use / rotating: each refresh revokes the token that was presented
 * and issues a fresh one, so a leaked refresh token can only be replayed
 * once before the rotation makes it useless. Only a SHA-256 hash of the
 * secret token is stored, same as TrustedDevice.
 */
@Entity('refresh_tokens')
@Index(['user_id'])
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  /** SHA-256 hash of the secret token. */
  @Column({ unique: true })
  token_hash: string;

  /** Stable id generated and stored by the client app, when available. */
  @Column({ type: 'varchar', nullable: true })
  device_id: string | null;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  /** Set once this token has been rotated (used) or explicitly revoked (logout). */
  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
