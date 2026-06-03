import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column({ type: 'int', nullable: true })
  shop_id: number | null;

  @Column({ type: 'varchar', length: 100 })
  plan: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: string;

  @Column('int', { default: 0 })
  price: number;

  @Column({ type: 'varchar', length: 8, default: 'XOF' })
  currency: string;

  @Column({ type: 'varchar', length: 20, default: 'month' })
  interval: string;

  @Column({ type: 'text', nullable: true })
  features: string | null;

  @Column({ type: 'int', nullable: true })
  max_bookings: number | null;

  @Column({ type: 'datetime', nullable: true })
  next_billing: Date | null;

  @Column({ type: 'datetime', nullable: true })
  started_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  ends_at: Date | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
