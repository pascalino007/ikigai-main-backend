import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Shops {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  category: string;

  @Column()
  type: string;

  @Column()
  address: string;

  @Column()
  pays: string;

  @Column()
  ville: string;

  @Column()
  quartier: string;

  @Column()
  phone: string;

  @Column()
  email: string;

  @Column({ type: 'text', nullable: true })
  non_loin_de: string;

  @Column({ type: 'text', nullable: true })
  description_shop: string;

  @Column({ nullable: true })
  profileImageUrl: string;

  @Column({ nullable: true })
  certificationImage: string;

  @Column({ type: 'simple-json', nullable: true })
  galleryImages: string[];

  @Column({ nullable: true })
  cfeImageUrl: string;

  // ✅ Array of arrays stored as JSON
  @Column({ type: 'simple-json', nullable: true })
  workingHours: string[][];

  @Column({ type: 'text', nullable: true })
  tags: string;

  @Column({ type: 'text', nullable: true })
  owner: string;
  
  @Column()
  registered_by: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
