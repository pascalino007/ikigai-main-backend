import { Module } from '@nestjs/common';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shops } from './shop.entity';
import { Users } from '../users/user.entity';
import { ProWalletModule } from '../providers/pro_wallet/pro_wallet.module';

@Module({
  imports: [TypeOrmModule.forFeature([Shops, Users]), ProWalletModule],
  controllers: [ShopsController],
  providers: [ShopsService],
  exports: [ShopsService],
})
export class ShopsModule {}
