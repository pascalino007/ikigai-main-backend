import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Worker } from './worker.entity';

/**
 * A manual busy block: the worker is unavailable for [start_time, end_time] on
 * `busy_date`, even without an in-app booking (e.g. busy in real life).
 * Used to block client booking slots and to flag the worker as 'occupé'.
 */
@Entity('worker_busy_periods')
@Index(['worker_id', 'busy_date'])
export class WorkerBusyPeriod {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  worker_id: number;

  /** The date this block applies to (YYYY-MM-DD). */
  @Column({ type: 'date' })
  busy_date: string;

  /** Start of the busy window (HH:mm). */
  @Column({ type: 'varchar', length: 5 })
  start_time: string;

  /** End of the busy window (HH:mm). */
  @Column({ type: 'varchar', length: 5 })
  end_time: string;

  @Column({ nullable: true })
  reason: string;

  @CreateDateColumn()
  created_at: Date;

  @ManyToOne(() => Worker, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;
}
