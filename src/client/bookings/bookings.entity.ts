import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Bookings {
    
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    user_id: string;

    @Column()
    provider_id: string;

    @Column()
    booking_date: Date;

    @Column()
    booking_time: Date;

    @Column({ default: 0 }) // 0 = pending, 1 = paid
    payement_status: number;

    @Column({ default: 0 })
    booking_status: number;

    @Column()
    service_id: string;
}
