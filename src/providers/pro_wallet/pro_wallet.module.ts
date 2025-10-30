import { Module } from '@nestjs/common';
import { ProWalletController } from './pro_wallet.controller';
import { ProWalletService } from './pro_wallet.service';

@Module({
  controllers: [ProWalletController],
  providers: [ProWalletService]
})
export class ProWalletModule {}
