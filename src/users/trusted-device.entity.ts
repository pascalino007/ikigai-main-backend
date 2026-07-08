import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * A device a user chose to "remember" after passing login OTP. While a matching
 * record is valid, that device skips the OTP step on subsequent logins.
 * Only a SHA-256 hash of the secret token is stored.
 */
@Entity('trusted_devices')
@Index(['user_id', 'device_id'])
export class TrustedDevice {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  /** Stable id generated and stored by the client app. */
  @Column()
  device_id: string;

  /** SHA-256 hash of the secret device token. */
  @Column()
  token_hash: string;

  /** Human-readable label, e.g. 'android' / 'ios'. */
  @Column({ type: 'varchar', nullable: true })
  device_name: string | null;

  @Column({ type: 'datetime' })
  expiresAt: Date;

  @Column({ type: 'datetime', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
