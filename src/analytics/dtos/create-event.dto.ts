import { IsString, IsOptional, IsInt, IsObject } from 'class-validator';

export class CreateEventDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  screen?: string;

  @IsOptional()
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsOptional()
  @IsObject()
  params?: Record<string, any>;
}
