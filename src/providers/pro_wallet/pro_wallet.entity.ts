import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('pro_wallets')
@Index(['shop_id'], { unique: true })
export class ProWallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  shop_id: number;

  /** Balance in smallest unit (e.g. FCFA) */
  @Column('int', { default: 0 })
  balance: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
