import { Controller, Get, Param, ParseIntPipe, Query, Post, Body } from '@nestjs/common';
import { ClientWalletService } from './client_wallet.service';

@Controller('client-wallet')
export class ClientWalletController {
  constructor(private readonly clientWalletService: ClientWalletService) {}

  @Get('user/:userId/summary')
  async summary(@Param('userId', ParseIntPipe) userId: number) {
    return this.clientWalletService.getSummary(userId);
  }

  @Get('user/:userId/transactions')
  async transactions(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('limit') limit?: string,
  ) {
    const n = limit ? parseInt(limit, 10) : 50;
    return this.clientWalletService.listTransactionsForUser(userId, n);
  }

  /** Get all client wallets with client info (admin only) */
  @Get()
  async findAll() {
    return this.clientWalletService.findAllWithClientInfo();
  }

  /** Manual top-up by admin */
  @Post(':id/topup')
  async topUp(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount: number },
  ) {
    return this.clientWalletService.manualTopUp(id, body.amount);
  }

  /** Reset wallet to 0 by admin */
  @Post(':id/reset')
  async reset(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clientWalletService.resetToZero(id);
  }
}
