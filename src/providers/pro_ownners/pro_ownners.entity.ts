import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class ProOwnners {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  firstname: string;

  @Column()
  lastname: string;

  @Column()
  email: string;

  @Column()
  phone_number: string;

  @Column()
  CNI_number: string;

  @Column()
  service_type: number;

  @Column()
  year_expe: number;

  @Column({ nullable: true })
  profileImageUrl: string;


  @Column({ type: 'simple-json', nullable: true })
  idcards: string[];

  
  @Column()
  registered_by: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
