import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

export type CommandeStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled';
export type PaymentMethod = 'wallet' | 'credit_card' | 'payer_a_la_livraison';

@Entity()
export class Commande {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'simple-json' })
  items: {
    product: {
      id: string;
      name: string;
      imageUrl: string;
      price: number;
      category: string;
    };
    quantity: number;
  }[];

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  delivery_fee: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  @Column()
  payment_method: string;

  @Column({ type: 'text', nullable: true })
  shipping_address: string;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  latitude: number;

  @Column({ type: 'decimal', precision: 10, scale: 8, nullable: true })
  longitude: number;

  @Column({ default: 'pending' })
  status: string;

  @Column({ nullable: true })
  user_id: number;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;
}
