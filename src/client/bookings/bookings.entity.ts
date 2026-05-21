import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  OneToOne,
} from 'typeorm';
import { Transaction } from '../../transaction/transaction.entity';

@Entity('bookings')
export class Bookings {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  user_id: number;

  @Column()
  provider_id: number;

  /**
   * YYYY-MM-DD. Stored as varchar so schema sync / legacy rows avoid MySQL
   * `0000-00-00` / strict `date` NOT NULL issues on ALTER.
   */
  @Column({ type: 'varchar', length: 10, nullable: true })
  booking_date: string | null;

  /** Time of day stored as datetime (legacy clients expect an ISO date-time in JSON). */
  @Column({ type: 'datetime' })
  booking_time: Date;

  /**
   * 0 = pending payment, 1 = confirmed (paid), 2 = cancelled, 3 = payment failed
   */
  @Column({ type: 'int', default: 0 })
  booking_status: number;

  /** Legacy mirror: 0 unpaid / pending, 1 paid (confirmed). Kept for existing mobile clients. */
  @Column({ name: 'payement_status', type: 'int', default: 0 })
  payement_status: number;

  @Column()
  service_id: number;

  /** Worker assigned to this booking (nullable for legacy bookings) */
  @Column({ type: 'int', nullable: true })
  worker_id: number | null;

  /** Booking end time (start + service duration) for collision detection */
  @Column({ type: 'datetime', nullable: true })
  booking_end_time: Date | null;

  /** Price snapshot in minor / whole currency units (e.g. FCFA). */
  @Column({ type: 'int' })
  amount: number;

  @Column({ type: 'varchar', length: 8, default: 'XOF' })
  currency: string;

  /** Unique token the client shows as QR for provider to scan → starts service */
  @Column({ type: 'varchar', length: 64, nullable: true })
  qr_checkin_token: string | null;

  /** Unique token the provider shows as QR for client to scan → ends service */
  @Column({ type: 'varchar', length: 64, nullable: true })
  qr_checkout_token: string | null;

  @Column({ type: 'datetime', nullable: true })
  checked_in_at: Date | null;

  @Column({ type: 'datetime', nullable: true })
  checked_out_at: Date | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  created_at: Date;

  @OneToOne(() => Transaction, (tx) => tx.booking)
  transaction?: Transaction;
}
