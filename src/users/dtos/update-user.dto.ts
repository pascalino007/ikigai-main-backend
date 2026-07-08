import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateUserDto } from './create-user.dto';

export class UpdateUserDto extends PartialType(CreateUserDto) {
  // Not part of CreateUserDto: lets an admin suspend/reactivate an account.
  // Must be declared here or the global whitelist ValidationPipe strips it.
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}