import { Controller, Get, Param, ParseIntPipe, Query, Post, Body, UseGuards } from '@nestjs/common';
import { ClientWalletService } from './client_wallet.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async findAll() {
    return this.clientWalletService.findAllWithClientInfo();
  }

  /** Manual top-up by admin */
  @Post(':id/topup')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async topUp(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount: number },
  ) {
    return this.clientWalletService.manualTopUp(id, body.amount);
  }

  /** Reset wallet to 0 by admin */
  @Post(':id/reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async reset(
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.clientWalletService.resetToZero(id);
  }
}
