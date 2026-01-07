import { Module } from '@nestjs/common';
import { TransactionsController } from './transaction.controller';
import { TransactionsService } from './transaction.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from './transaction.entity';
import { ClientWallet } from 'src/client/client_wallet/client_wallet.entity';
import { ClientWalletService } from 'src/client/client_wallet/client_wallet.service';



@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      ClientWallet,
    ]),
  ],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    ClientWalletService ,
    
  ],
})
export class TransactionModule {}
