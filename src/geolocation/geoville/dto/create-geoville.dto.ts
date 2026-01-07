// src/geoville/dto/create-geoville.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
} from 'class-validator';

export class CreateGeovilleDto {
  @IsString()
  @IsNotEmpty()
  countryId: string;

  @IsString()
  @IsNotEmpty()
  regionId: string;

  @IsOptional()
  @IsString()
  cityId?: string;

  @IsOptional()
  @IsString()
  districtId?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  zoneName?: string;

  @IsOptional()
 
  @IsString({ each: true })
  tags?: string;
}

