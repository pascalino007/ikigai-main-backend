import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Product {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column({ nullable: true })
  image1: string;

  @Column({ nullable: true })
  image2: string;

  @Column({ nullable: true })
  image3: string;

  @Column()
  price: string;

  @Column()
  Category: string;

  @Column({ nullable: true })
  sous_category: string;

  @Column()
  status: string;

  @Column({ type: 'text', nullable: true })
  Description: string;

  @Column()
  provider_id: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
