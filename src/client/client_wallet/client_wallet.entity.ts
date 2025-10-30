import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class ClientWallet {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  client_id: number;

  @Column()
  balance: string;


  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
