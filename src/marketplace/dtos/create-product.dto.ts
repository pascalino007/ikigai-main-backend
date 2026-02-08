import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateProductDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  image1?: string;

  @IsOptional()
  @IsString()
  image2?: string;

  @IsOptional()
  @IsString()
  image3?: string;

  @IsNotEmpty()
  @IsString()
  price: string;

  @IsNotEmpty()
  @IsString()
  Category: string;

  @IsNotEmpty()
  @IsString()
  status: string;

  @IsOptional()
  @IsString()
  Description?: string;

  @IsNotEmpty()
  @IsNumber()
  provider_id: number;
}
