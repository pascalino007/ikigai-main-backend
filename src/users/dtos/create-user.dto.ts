import { IsEmail, IsNotEmpty, IsString } from "class-validator";
export class CreateUserDto {

        @IsNotEmpty()
        @IsString()
        firstname : string ;
    
        @IsNotEmpty()
        @IsString()
        lastname : string ;
    
        @IsNotEmpty()
        @IsString()
        phone : string ;

       @IsEmail()
        email : string ;

        @IsNotEmpty()
        @IsString()
        password : string ;
    
        @IsNotEmpty()
        @IsString()
        role : string ;

        @IsNotEmpty()
        @IsString()
        image : string ;
    
}