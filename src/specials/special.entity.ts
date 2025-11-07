import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('specials')
export class Special {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ nullable: true })
  serviceId: string;

  @Column({ nullable: true })
  shopId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  originalPrice: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  discountedPrice: number;

  @Column({ type: 'datetime', nullable: true })
  startDate: Date;

  @Column({ type: 'datetime', nullable: true })
  endDate: Date;

  @Column({ nullable: true })
  duration: string;

  @Column({ type: 'int', default: 0 })
  maxUses: number;

  @Column({ type: 'varchar', nullable: true })
  image: string | null; // url or path

  @Column({ type: 'text', nullable: true })
  termsAndConditions: string;

  @Column({ type: 'int', default: 0 })
  uses: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
