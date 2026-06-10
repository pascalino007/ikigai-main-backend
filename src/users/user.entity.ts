import {Entity , Column, PrimaryGeneratedColumn} from 'typeorm';

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

    @Column({ select: false })
    password : string ;

    @Column()
    role : string ;


    @Column()
    image : string ;


    @Column()
    is_active : boolean ;

    @Column()
    createdAt : Date ;


    /** Points earned by enrollers for registering shops */
    @Column({ type: 'int', default: 0 })
    points: number;

    /** For enrollers: ID of the manager (or admin) who created them */
    @Column({ type: 'int', nullable: true })
    superior_id: number | null;

    @Column({ type: 'text', nullable: true })
    fcm_token: string | null;

}