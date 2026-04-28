import { Module } from '@nestjs/common';
import { TransactionsController } from './transaction.controller';
import { TransactionsService } from './transaction.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { ClientWallet } from 'src/client/client_wallet/client_wallet.entity';
import { ClientWalletService } from 'src/client/client_wallet/client_wallet.service';
import { Users } from '../users/user.entity';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, ClientWallet, Users]),
    PaymentsModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, ClientWalletService],
  exports: [TransactionsService],
})
export class TransactionModule {}
