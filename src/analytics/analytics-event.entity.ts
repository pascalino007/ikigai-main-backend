import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * First-party analytics event sent by the mobile app. Each event is also
 * logged to Firebase/Google Analytics on the device; this table is what the
 * dashboard reads so it can show numbers without the GA4 Data API.
 */
@Entity('analytics_events')
export class AnalyticsEvent {
  @PrimaryGeneratedColumn()
  id: number;

  /** Event name, e.g. 'app_open', 'screen_view', 'shop_view'. */
  @Index()
  @Column()
  name: string;

  /** Screen/route name for screen_view events. */
  @Column({ type: 'varchar', nullable: true })
  screen: string | null;

  /** App user id, when the client is logged in. */
  @Index()
  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  /** 'android' | 'ios'. */
  @Column({ type: 'varchar', nullable: true })
  platform: string | null;

  /** Arbitrary extra params, stored as JSON. */
  @Column({ type: 'text', nullable: true })
  params: string | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;
}
