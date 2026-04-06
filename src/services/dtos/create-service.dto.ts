import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

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

  @IsOptional()
  @IsString()
  sous_category?: string;

  @IsNotEmpty()
  @IsString()
  price: string;

  @IsNotEmpty()
  @IsString()
  duration: string;

  @IsOptional()
  @IsString()
  tags?: string;

  @IsOptional()
  @IsString()
  imageurl?: string;

  @IsOptional()
  @IsString()
  provider_id?: number;

  @IsOptional()
  @IsString()
  provider_name?: string;
}
