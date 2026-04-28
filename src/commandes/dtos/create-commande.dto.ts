import { IsString, IsOptional, IsArray, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCommandeDto {
  @IsArray()
  items: any[];

  @Type(() => Number)
  @IsNumber()
  subtotal: number;

  @Type(() => Number)
  @IsNumber()
  delivery_fee: number;

  @Type(() => Number)
  @IsNumber()
  total: number;

  @IsString()
  @IsIn(['wallet', 'credit_card', 'payer_a_la_livraison'])
  payment_method: string;

  @IsOptional()
  @IsString()
  shipping_address?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  user_id?: number;
}
