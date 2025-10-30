import {Entity , Column, PrimaryGeneratedColumn} from 'typeorm';

@Entity()
export class Categories {
    
    @PrimaryGeneratedColumn()
    id : number ;

    @Column()
    name : string ;

    @Column()
    description : string ;

    @Column()
    imageurl : string ;


    @Column()
    is_active : boolean ;

    @Column()
    createdAt : Date ;


   


}