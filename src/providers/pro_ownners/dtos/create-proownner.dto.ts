import { IsNotEmpty, IsString, IsEmail, IsOptional, IsArray, IsNumber } from 'class-validator';

export class CreateProOwnnerDto {
  @IsNotEmpty()
  @IsString()
  firstname: string;

  @IsNotEmpty()
  @IsString()
  lastname: string;

  @IsNotEmpty()
  @IsEmail()
  email: string;

  @IsNotEmpty()
  @IsString()
  phone_number: string;

  @IsNotEmpty()
  @IsString()
  CNI_number: string;

  @IsNotEmpty()
  @IsNumber()
  service_type: number;

  @IsNotEmpty()
  @IsNumber()
  year_expe: number;

  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  @IsOptional()
  @IsArray()
  idcards?: string[];

  @IsNotEmpty()
  @IsString()
  registered_by: string;
}
