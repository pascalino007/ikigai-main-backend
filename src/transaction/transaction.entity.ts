import {Entity , Column, PrimaryGeneratedColumn} from 'typeorm';

@Entity()
export class Transactionm {
    
    @PrimaryGeneratedColumn()
    id : number ;

    @Column()
    label : string ;

    @Column()
    user_id : number ;

    @Column()
    amount : number ;

    @Column()
    status : number ;

    @Column()
    beneficiary_id : number ;

    @Column()
    transaction_id : Date ;

    @Column()
    transaction_motif_id : string ;

    @Column()
    payement_method : string ;

    @Column()
    createdAt : Date ;


}