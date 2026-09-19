import { Controller, Post, Get, Body, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transaction.service';
import { InitiateDepositDto } from './dtos/initiate-deposit.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

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

  /** Polled by the app while waiting for a redirect-based payment (PayGate) to confirm. */
  @Get('ref/:ref')
  getTransactionByRef(@Param('ref') ref: string) {
    return this.transactionsService.getTransactionByRef(ref);
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  getAllTransactions() {
    return this.transactionsService.getAllTransactions();
  }

  @Get('shop/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider')
  initiateSubscriptionPayment(
    @Body() body: {
      shopId?: number;
      amount: number;
      plan: string;
      interval: 'month' | 'year';
      paymentProvider: 'stripe' | 'kkiapay' | 'paygate' | 'sandbox';
      paymentChannel: string;
      phone?: string;
      network?: string;
    },
    @Req() req: any,
  ) {
    // userId is always the caller — never trust a body-supplied one here.
    return this.transactionsService.initiateSubscriptionPayment({ ...body, userId: req.user.id });
  }

  @Get('withdrawals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  getWithdrawals(@Query('status') status?: 'pending' | 'success' | 'failed') {
    return this.transactionsService.getWithdrawals(status);
  }

  @Post('withdrawals/:id/confirm')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  confirmWithdrawal(@Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.confirmWithdrawal(id);
  }

  @Post('withdrawals/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  rejectWithdrawal(@Param('id', ParseIntPipe) id: number) {
    return this.transactionsService.rejectWithdrawal(id);
  }
}
