import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { WorkerSchedule } from './worker-schedule.entity';
import { WorkerException } from './worker-exception.entity';

@Entity('workers')
export class Worker {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  shop_id: number;

  @Column()
  first_name: string;

  @Column()
  last_name: string;

  @Column({ nullable: true })
  phone: string;

  @Column({ nullable: true })
  email: string;

  @Column({ nullable: true })
  avatar_url: string;

  @Column({ nullable: true })
  speciality: string;

  /** Buffer time (minutes) between consecutive bookings */
  @Column({ type: 'int', default: 5 })
  buffer_minutes: number;

  @Column({ default: true })
  is_active: boolean;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => WorkerSchedule, (s) => s.worker, { cascade: true })
  schedules: WorkerSchedule[];

  @OneToMany(() => WorkerException, (e) => e.worker, { cascade: true })
  exceptions: WorkerException[];
}
