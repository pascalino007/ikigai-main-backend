import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ProWalletService } from './pro_wallet.service';

@Controller('pro-wallet')
export class ProWalletController {
  constructor(private readonly service: ProWalletService) {}

  @Get('shop/:shopId')
  summary(@Param('shopId', ParseIntPipe) shopId: number) {
    return this.service.getSummary(shopId);
  }

  @Get('shop/:shopId/transactions')
  transactions(@Param('shopId', ParseIntPipe) shopId: number) {
    return this.service.getTransactions(shopId);
  }

  @Post('shop/:shopId/withdraw')
  withdraw(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() body: { amount: number; phone?: string },
  ) {
    return this.service.requestWithdrawal(shopId, body.amount, body.phone);
  }

  @Post('shop/:shopId/credit')
  credit(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() body: { amount: number; label: string; transactionRef: string },
  ) {
    return this.service.creditForBooking(shopId, body.amount, body.label, body.transactionRef);
  }

  @Post('shop/:shopId/subscription/pay')
  paySubscriptionFromWallet(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() body: { amount: number; plan: string; interval: 'month' | 'year' },
  ) {
    return this.service.paySubscriptionFromWallet(shopId, body.amount, body.plan, body.interval);
  }
}
