import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Worker } from './worker.entity';

/**
 * Weekly recurring schedule for a worker.
 * day_of_week: 0=Sunday, 1=Monday ... 6=Saturday
 */
@Entity('worker_schedules')
export class WorkerSchedule {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  worker_id: number;

  /** 0=Sunday, 1=Monday, ..., 6=Saturday */
  @Column({ type: 'int' })
  day_of_week: number;

  /** Start time HH:mm (24h format) */
  @Column({ type: 'varchar', length: 5 })
  start_time: string;

  /** End time HH:mm (24h format) */
  @Column({ type: 'varchar', length: 5 })
  end_time: string;

  @Column({ default: true })
  is_active: boolean;

  @ManyToOne(() => Worker, (w) => w.schedules, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'worker_id' })
  worker: Worker;
}
