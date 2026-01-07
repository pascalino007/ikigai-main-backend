import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
} from 'typeorm';

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  label: string;

  @Column()
  fromUserId: number;

  @Column()
  toUserId: number;

  /** Always positive */
  @Column('int')
  amount: number;

  /** -1 failed | 0 pending | 1 success */
  @Column('int')
  status: number;

  /** 1 deposit | 2 subscription | 3 order | ... */
  @Column('int')
  transactionMotifId: number;

  /** internal / gateway reference */
  @Column({ unique: true })
  transactionRef: string;

  /** wallet | cash | momo | card */
  @Column()
  paymentMethod: string;

  /** Wallet balance before transaction */
  @Column('int')
  balanceBefore: number;

  /** Wallet balance after transaction */
  @Column('int')
  balanceAfter: number;

  @CreateDateColumn()
  createdAt: Date;
}
