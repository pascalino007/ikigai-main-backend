import { Module } from '@nestjs/common';
import { ClientWalletController } from './client_wallet.controller';
import { ClientWalletService } from './client_wallet.service';
import { ClientWallet } from './client_wallet.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../../transaction/transaction.entity';
import { Users } from '../../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ClientWallet, Transaction, Users])],
  controllers: [ClientWalletController],
  providers: [ClientWalletService]
})
export class ClientWalletModule {}
