import { IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

const PAYMENT_PROVIDERS = ['stripe', 'kkiapay', 'sandbox'] as const;
const PAYMENT_CHANNELS = ['card', 'mobile_money'] as const;

export class InitiateDepositDto {
  @Type(() => Number)
  @IsInt()
  clientId: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amount: number;

  @IsString()
  @IsIn([...PAYMENT_CHANNELS])
  paymentChannel: string;

  @IsString()
  @IsIn([...PAYMENT_PROVIDERS])
  paymentProvider: string;
}
