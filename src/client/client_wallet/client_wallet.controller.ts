import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
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
}
