import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, Index } from 'typeorm';

export type MiServiceOrderStatus = 'pending' | 'paid' | 'failed';

@Entity('mi_service_orders')
@Index(['shop_id'])
export class MiServiceOrder {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  mi_service_id: number;

  @Column()
  shop_id: number;

  @Column({ nullable: true })
  user_id: number;

  @Column('int')
  amount: number;

  @Column({ default: 'pending' })
  status: string;

  @Column({ unique: true })
  transaction_ref: string;

  @Column({ nullable: true })
  payment_method: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  payment_provider: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  external_payment_id: string;

  @CreateDateColumn()
  createdAt: Date;
}
