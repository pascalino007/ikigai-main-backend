import {Entity , Column, PrimaryGeneratedColumn} from 'typeorm';

@Entity()
export class SousCategories {
    
    @PrimaryGeneratedColumn()
    id : number ;

    @Column()
    name: string ;

    @Column()
    category: string ;


    @Column()
    tags: string ;


    @Column()
    is_active : boolean ;

    @Column()
    createdAt : Date ;


   


}