import {Entity , Column, PrimaryGeneratedColumn} from 'typeorm';

@Entity()
export class Services {
    
    @PrimaryGeneratedColumn()
    id : number ;

    @Column()
    name : string ;

    @Column()
    description : string ;

    @Column()
    Category : string ;

    @Column()
    sous_category : string ;

    @Column()
    price : string ;

    @Column()
    duration : string ;

    @Column({ type: 'text', nullable: true })
    tags: string;

    @Column()
    imageurl : string ;

    @Column({ nullable: true })
    provider_id : number ;

    @Column({ nullable: true })
    provider_name : string ;

    @Column()
    is_active : boolean ;

    @Column()
    createdAt : Date ;
    

   

}