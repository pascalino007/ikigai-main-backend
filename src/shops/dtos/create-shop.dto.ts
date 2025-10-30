import { IsString, IsOptional, IsArray, IsEmail } from 'class-validator';

export class CreateShopDto {
  @IsString()
  name: string;

  @IsString()
  category: string;

  @IsString()
  type: string;

  @IsString()
  address: string;

  @IsString()
  pays: string;

  @IsString()
  ville: string;

  @IsString()
  quartier: string;

  @IsString()
  phone: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  non_loin_de?: string;

  @IsOptional()
  @IsString()
  description_shop?: string;

  @IsOptional()
  @IsString()
  profileImageUrl?: string;

  @IsOptional()
  @IsString()
  certificationImage?: string;

  @IsOptional()
  @IsArray()
  galleryImages?: string[];

  @IsOptional()
  @IsString()
  cfeImageUrl?: string;

  // ✅ Array of arrays (e.g. [["Monday", "09:00-18:00"], ["Tuesday", "09:00-18:00"]])
  @IsOptional()
  @IsArray()
  workingHours?: string[][];

  @IsOptional()
  @IsString()
  tags?: string;

  @IsOptional()
  @IsString()
  owner?: string;

  @IsString()
  registered_by: string;
}
