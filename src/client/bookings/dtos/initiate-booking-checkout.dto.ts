import {
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

const PAYMENT_CHANNELS = ['card', 'mobile_money', 'wallet'] as const;

const PAYMENT_PROVIDERS = [
  'stripe',
  'kkiapay',
  'paygate',
  'wallet',
  'sandbox',
] as const;

export type PaymentProviderId = (typeof PAYMENT_PROVIDERS)[number];
export type PaymentChannelId = (typeof PAYMENT_CHANNELS)[number];

export class InitiateBookingCheckoutDto {
  @Type(() => Number)
  @IsInt()
  user_id: number;

  @Type(() => Number)
  @IsInt()
  provider_id: number;

  @Type(() => Number)
  @IsInt()
  service_id: number;

  @IsDateString()
  booking_date: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'booking_time must be HH:mm (24h)',
  })
  booking_time: string;

  @IsIn([...PAYMENT_CHANNELS])
  payment_channel: PaymentChannelId;

  @IsString()
  @IsIn([...PAYMENT_PROVIDERS])
  payment_provider: PaymentProviderId;
}
