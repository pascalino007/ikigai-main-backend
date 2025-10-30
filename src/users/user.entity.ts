import {Entity , Column, PrimaryGeneratedColumn, AfterInsert} from 'typeorm';

@Entity()
export class Users {
    
    @PrimaryGeneratedColumn()
    id : number ;

    @Column()
    firstname : string ;

    @Column()
    lastname : string ;

    @Column()
    phone : string ;


    @Column()
    email : string ;

    @Column()
    password : string ;

    @Column()
    role : string ;


    @Column()
    image : string ;


    @Column()
    is_active : boolean ;

    @Column()
    createdAt : Date ;

   


}