import { IsDateString, IsNotEmpty, Matches } from 'class-validator';

export class RescheduleBookingDto {
  @IsDateString()
  @IsNotEmpty()
  newDate: string; // YYYY-MM-DD

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'newTime must be in HH:mm format' })
  newTime: string;
}
