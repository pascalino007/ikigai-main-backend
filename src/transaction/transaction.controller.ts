import { Controller, Post, Get, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { TransactionsService } from './transaction.service';
import { InitiateDepositDto } from './dtos/initiate-deposit.dto';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * Initiate a wallet top-up. Returns a pending transaction + provider-specific
   * clientInstructions (Stripe clientSecret or Kkiapay widget config).
   */
  @Post('deposit/initiate')
  initiateDeposit(@Body() dto: InitiateDepositDto) {
    return this.transactionsService.initiateDeposit(dto);
  }

  @Post('deposit/confirm')
  confirmDeposit(@Body() body: { transactionRef: string }) {
    return this.transactionsService.confirmDeposit(body.transactionRef);
  }

  
  @Post('pay/initiate')
  initiatePayment(
    @Body()
    body: { fromUserId: number; toUserId: number; amount: number },

  ) {
    return this.transactionsService.initiateUserPayment(
      body.fromUserId,
      body.toUserId,
      body.amount,
    );
  }

  @Post('pay/confirm')
  confirmPayment(@Body() body: { transactionRef: string }) {
    return this.transactionsService.confirmUserPayment(body.transactionRef);
  }

 

  @Get('user/:id')
  getUserTransactions(@Param('id', ParseIntPipe) clientId: number) {
    return this.transactionsService.getUserTransactions(clientId);
  }

  @Get('admin/all')
  getAllTransactions() {
    return this.transactionsService.getAllTransactions();
  }

  @Get('shop/:id')
  getShopTransactions(@Param('id', ParseIntPipe) shopId: number) {
    return this.transactionsService.getShopTransactions(shopId);
  }

  @Post('withdrawal/request')
  requestWithdrawal(
    @Body() body: { userId: number; amount: number; phone?: string },
  ) {
    return this.transactionsService.requestWithdrawal(body);
  }

  @Post('subscription/initiate')
  initiateSubscriptionPayment(
    @Body() body: {
      userId: number;
      shopId?: number;
      amount: number;
      plan: string;
      interval: 'month' | 'year';
      paymentProvider: 'stripe' | 'kkiapay' | 'sandbox';
      paymentChannel: string;
    },
  ) {
    return this.transactionsService.initiateSubscriptionPayment(body);
  }

  @Get('withdrawals')
  getWithdrawals(@Query('status') status?: 'pending' | 'success' | 'failed') {
    return this.transactionsService.getWithdrawals(status);
  }

  @Post('withdrawals/:id/confirm')
  confirmWithdrawal(@Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.confirmWithdrawal(id);
  }

  @Post('withdrawals/:id/reject')
  rejectWithdrawal(@Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.rejectWithdrawal(id);
  }
}
