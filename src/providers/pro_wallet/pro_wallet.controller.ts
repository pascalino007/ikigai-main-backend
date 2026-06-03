import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ProWalletService } from './pro_wallet.service';

@Controller('pro-wallet')
export class ProWalletController {
  constructor(private readonly service: ProWalletService) {}

  @Get('shop/:shopId')
  summary(@Param('shopId', ParseIntPipe) shopId: number) {
    return this.service.getSummary(shopId);
  }

  @Post('shop/:shopId/credit')
  credit(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() body: { amount: number; label: string; transactionRef: string },
  ) {
    return this.service.creditForBooking(shopId, body.amount, body.label, body.transactionRef);
  }
}
