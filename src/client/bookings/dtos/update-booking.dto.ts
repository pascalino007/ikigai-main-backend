import { IsNumber } from 'class-validator';

export class UpdatePaymentStatusDto {
  @IsNumber()
  payement_status: number; // 1
}
