import { IsNotEmpty, IsString } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

/** Full sign-up payload plus the OTP the user received by email. */
export class RegisterWithOtpDto extends CreateUserDto {
  @IsNotEmpty()
  @IsString()
  otp: string;
}
