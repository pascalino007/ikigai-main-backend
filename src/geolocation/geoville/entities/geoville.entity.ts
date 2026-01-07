// src/geoville/entities/geoville.entity.ts

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('geovilles')
export class Geoville {
  @PrimaryGeneratedColumn()
  id: string;

  /* Relations (IDs pour commencer) */
  @Column()
  countryId: string;

  @Column()
  regionId: string;

  @Column({ nullable: true })
  cityId?: string;

  @Column({ nullable: true })
  districtId?: string;

  /* Core data */
  @Column()
  name: string; // Nom du quartier

  @Column({ nullable: true })
  zoneName?: string;

  /* Extra */
  @Column({ nullable: true })
  tags?: string;

  /* Meta */
  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

