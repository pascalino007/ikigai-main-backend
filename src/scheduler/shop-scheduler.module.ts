import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShopSchedulerService } from './shop-scheduler.service';
import { Shops } from '../shops/shop.entity';
import { ShopsModule } from '../shops/shops.module';

@Module({
  imports: [TypeOrmModule.forFeature([Shops]), ShopsModule],
  providers: [ShopSchedulerService],
})
export class ShopSchedulerModule {}
