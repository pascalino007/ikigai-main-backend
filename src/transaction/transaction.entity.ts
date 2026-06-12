import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  OneToOne,
  JoinColumn,
  RelationId,
  Index,
} from 'typeorm';
import { Bookings } from '../client/bookings/bookings.entity';

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

  @Column({ type: 'varchar', length: 8, default: 'XOF' })
  currency: string;

  /** -1 failed | 0 pending | 1 success */
  @Column('int')
  status: number;

  /** 1 deposit | 2 subscription | 3 order | … | 9 booking */
  @Column('int')
  transactionMotifId: number;

  /** Internal reference (sent to aggregators as metadata / merchant ref). */
  @Column({ unique: true })
  transactionRef: string;

  /**
   * Optional shared reference for bulk checkouts (e.g. multi-booking cart paid as one).
   * All transactions in the same bulk share this ref; a single payment intent is
   * created with bulkRef as its merchant reference, and the webhook fans out
   * the result to every transaction with this bulkRef.
   */
  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  bulkRef: string | null;

  /** wallet | card | mobile_money — channel used with our ledger */
  @Column()
  paymentMethod: string;

  /** stripe | kkiapay | paygate | sandbox | … */
  @Column({ type: 'varchar', length: 32, nullable: true })
  paymentProvider: string | null;

  /** Id from Stripe / Kkiapay / Paygate for reconciliation & idempotent webhooks */
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  externalPaymentId: string | null;

  /** Wallet balance before transaction (external booking payments may mirror client wallet if present). */
  @Column('int')
  balanceBefore: number;

  /** Wallet balance after transaction */
  @Column('int')
  balanceAfter: number;

  @OneToOne(() => Bookings, (b) => b.transaction, { nullable: true })
  @JoinColumn({ name: 'bookingId' })
  booking?: Bookings;

  @RelationId((t: Transaction) => t.booking)
  bookingId: number | null;

  @Column({ type: 'json', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;
}
