import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Worker } from './worker.entity';

export type ExceptionType = 'day_off' | 'custom_hours';

/**
 * Date-specific overrides: day off or custom hours for a specific date.
 */
@Entity('worker_exceptions')
export class WorkerException {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  worker_id: number;

  /** The specific date this exception applies to (YYYY-MM-DD) */
  @Column({ type: 'date' })
  exception_date: string;

  @Column({ type: 'enum', enum: ['day_off', 'custom_hours'], default: 'day_off' })
  type: ExceptionType;

  /** Custom start time (only for custom_hours type) */
  @Column({ type: 'varchar', length: 5, nullable: true })
  start_time: string | null;

  /** Custom end time (only for custom_hours type) */
  @Column({ type: 'varchar', length: 5, nullable: true })
  end_time: string | null;

  @Column({ nullable: true })
  reason: string;

  @ManyToOne(() => Worker, (w) => w.exceptions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;
}
