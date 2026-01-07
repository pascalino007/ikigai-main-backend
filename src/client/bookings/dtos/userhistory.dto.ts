import { IsDateString, IsNotEmpty } from 'class-validator';

export class UserHistoryDto {
  @IsDateString()
  @IsNotEmpty()
  start: string;  // YYYY-MM-DD

  @IsDateString()
  @IsNotEmpty()
  end: string;    // YYYY-MM-DD
}
