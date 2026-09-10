import { Controller, Get, Post, Body, Param, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { ProWalletService } from './pro_wallet.service';

/**
 * Every route here is scoped to a shop's own owner (see
 * ProWalletService.assertShopOwnership) — these previously had NO auth guard
 * at all, so anyone who could guess/enumerate a shopId could read another
 * shop's balance/transactions or drain its wallet via /withdraw.
 */
@Controller('pro-wallet')
@UseGuards(JwtAuthGuard)
export class ProWalletController {
  constructor(private readonly service: ProWalletService) {}

  @Get('shop/:shopId')
  summary(@Param('shopId', ParseIntPipe) shopId: number, @Req() req: any) {
    return this.service.getSummary(shopId, req.user.id);
  }

  @Get('shop/:shopId/transactions')
  transactions(@Param('shopId', ParseIntPipe) shopId: number, @Req() req: any) {
    return this.service.getTransactions(shopId, req.user.id);
  }

  @Post('shop/:shopId/withdraw')
  withdraw(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() body: { amount: number; phone?: string },
    @Req() req: any,
  ) {
    return this.service.requestWithdrawal(shopId, body.amount, body.phone, req.user.id);
  }

  @Post('shop/:shopId/subscription/pay')
  paySubscriptionFromWallet(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Body() body: { amount: number; plan: string; interval: 'month' | 'year' },
    @Req() req: any,
  ) {
    return this.service.paySubscriptionFromWallet(
      shopId,
      body.amount,
      body.plan,
      body.interval,
      req.user.id,
    );
  }

  // No route for ProWalletService.creditManual(): it's an unrestricted
  // "credit any shop any amount" operation with no admin-role system yet to
  // gate it, and nothing in either app currently calls it. Wire it up again
  // once real admin auth exists, or call it from a one-off script like
  // src/scripts/reconcile-booking-credits.ts.
}
