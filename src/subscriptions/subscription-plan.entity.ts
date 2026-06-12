import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('subscription_plans')
export class SubscriptionPlan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true })
  key: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100 })
  subtitle: string;

  @Column({ type: 'varchar', length: 255 })
  description: string;

  @Column({ type: 'int', default: 0 })
  monthly_price: number;

  @Column({ type: 'int', default: 0 })
  yearly_price: number;

  @Column({ type: 'varchar', length: 20, default: 'XOF' })
  currency: string;

  @Column({ type: 'varchar', length: 50, default: '#6B7280' })
  accent_color: string;

  @Column({ type: 'boolean', default: false })
  is_recommended: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'text', nullable: true })
  features_json: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
