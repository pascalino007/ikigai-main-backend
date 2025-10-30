import { IsNotEmpty, IsString, IsOptional, IsUrl } from 'class-validator';

export class CreateServiceDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  description: string;

  @IsNotEmpty()
  @IsString()
  Category: string;

  @IsNotEmpty()
  @IsString()
  sous_category: string;

  @IsNotEmpty()
  @IsString()
  price: string;

  @IsNotEmpty()
  @IsString()
  duration: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsNotEmpty()
  @IsUrl()
  imageurl: string;

  @IsOptional()
  @IsString()
  provider_id?: number;

  @IsOptional()
  @IsString()
  provider_name?: string;
}
