import { Module } from '@nestjs/common';
import { ClientWalletController } from './client_wallet.controller';
import { ClientWalletService } from './client_wallet.service';
import { ClientWallet } from './client_wallet.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([ClientWallet])],
  controllers: [ClientWalletController],
  providers: [ClientWalletService]
})
export class ClientWalletModule {}
