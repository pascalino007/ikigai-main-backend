import { Controller, Post, Get, Body } from '@nestjs/common';
import { TransactionsService } from './transaction.service';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Post('deposit/initiate')
  initiateDeposit(
    @Body() body: { clientId: number; amount: number; paymentMethod: string },
  ) {
    return this.transactionsService.initiateDeposit(
      body.clientId,
      body.amount,
      body.paymentMethod,
    );
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
  getUserTransactions(@Body('id') clientId: number) {
    return this.transactionsService.getUserTransactions(clientId);
  }

  @Get('admin/all')
  getAllTransactions() {
    return this.transactionsService.getAllTransactions();
  }
}
