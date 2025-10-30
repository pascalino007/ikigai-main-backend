import {Entity , Column, PrimaryGeneratedColumn} from 'typeorm';

@Entity()
export class Bookings {
    
    @PrimaryGeneratedColumn()
    id : number ;

    @Column()
    user_id : string ;

    @Column()
    provider_id : string ;

    @Column()
    booking_date : Date ;

    @Column()
    booking_time : Date ;

    payement_status : number ;

    booking_status : string ;

    @Column()
    service_id : string ;


    

   


}