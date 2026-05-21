import { IsString, IsNumber, IsOptional, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateScheduleDto {
  @IsNumber()
  day_of_week: number; // 0-6

  @IsString()
  start_time: string; // HH:mm

  @IsString()
  end_time: string; // HH:mm
}

export class CreateWorkerDto {
  @IsNumber()
  shop_id: number;

  @IsString()
  first_name: string;

  @IsString()
  last_name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @IsString()
  speciality?: string;

  @IsOptional()
  @IsNumber()
  buffer_minutes?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleDto)
  schedules?: CreateScheduleDto[];
}

export class UpdateWorkerDto {
  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  avatar_url?: string;

  @IsOptional()
  @IsString()
  speciality?: string;

  @IsOptional()
  @IsNumber()
  buffer_minutes?: number;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateScheduleDto)
  schedules?: CreateScheduleDto[];
}

export class CreateExceptionDto {
  @IsNumber()
  worker_id: number;

  @IsString()
  exception_date: string; // YYYY-MM-DD

  @IsOptional()
  @IsString()
  type?: 'day_off' | 'custom_hours';

  @IsOptional()
  @IsString()
  start_time?: string;

  @IsOptional()
  @IsString()
  end_time?: string;

  @IsOptional()
  @IsString()
  reason?: string;
}
