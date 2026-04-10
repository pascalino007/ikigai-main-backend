import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreateSongDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  artist?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  order?: number;
}

export class UpdateSongDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  artist?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  order?: number;
}
