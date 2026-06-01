import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export type ShopGrade = 'basic' | 'pro' | 'elite';
export type ShopStatus = 'open' | 'ouvert' | 'occupé' | 'free' | 'closed';

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

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  longitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

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

  @Column({ type: 'int', nullable: true })
  user_id: number | null;

  @Column()
  registered_by: string;

  @Column({ type: 'enum', enum: ['basic', 'pro', 'elite'], default: 'basic' })
  grade: ShopGrade;

  @Column({ type: 'enum', enum: ['open', 'ouvert', 'occupé', 'free', 'closed'], default: 'ouvert' })
  status: ShopStatus;

  @Column({ default: true })
  is_active: boolean;

  @Column({ default: false })
  is_verified: boolean;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

}
