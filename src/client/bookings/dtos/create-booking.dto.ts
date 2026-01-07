import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class CreateBookingDto {
  @IsString()
  @IsNotEmpty()
  user_id: string;

  @IsString()
  @IsNotEmpty()
  provider_id: string;

  @IsString()
  @IsNotEmpty()
  service_id: string;

  @IsDateString()
  @IsNotEmpty()
  booking_date: string; // YYYY-MM-DD

  @IsString()
  @IsNotEmpty()
  booking_time: string; // "14:00" or "08:30"
}
