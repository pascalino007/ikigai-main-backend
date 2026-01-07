import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('client_wallets')
@Index(['client_id'], { unique: true })
export class ClientWallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  client_id: number;

  /** Balance in smallest unit (e.g. FCFA) */
  @Column('int', { default: 0 })
  balance: number;

  @UpdateDateColumn()
  updatedAt: Date;
}
