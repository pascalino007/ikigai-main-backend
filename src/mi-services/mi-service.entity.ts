import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('mi_services')
export class MiService {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  imageUrl: string;

  @Column('int')
  price: number;

  @Column({ type: 'text', nullable: true })
  details: string;

  /** FK to mi_service_categories.id (nullable for legacy rows). */
  @Column({ nullable: true })
  categoryId: number;

  /** Temps de réalisation estimé, en jours. */
  @Column('int', { default: 1 })
  realisationDays: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;
}
