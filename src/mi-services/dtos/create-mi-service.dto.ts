import { IsString, IsNumber, IsOptional, IsBoolean } from 'class-validator';

export class CreateMiServiceDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  imageUrl?: string;

  @IsNumber()
  price: number;

  @IsString()
  @IsOptional()
  details?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
