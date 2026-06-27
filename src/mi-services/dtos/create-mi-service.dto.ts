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

  @IsNumber()
  @IsOptional()
  categoryId?: number;

  /** Temps de réalisation estimé, en jours. */
  @IsNumber()
  @IsOptional()
  realisationDays?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
