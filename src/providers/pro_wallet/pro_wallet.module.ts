import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProWalletController } from './pro_wallet.controller';
import { ProWalletService } from './pro_wallet.service';
import { ProWallet } from './pro_wallet.entity';
import { Transaction } from '../../transaction/transaction.entity';
import { Shops } from '../../shops/shop.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ProWallet, Transaction, Shops])],
  controllers: [ProWalletController],
  providers: [ProWalletService],
  exports: [ProWalletService],
})
export class ProWalletModule {}
