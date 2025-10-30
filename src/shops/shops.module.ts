import { Module } from '@nestjs/common';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shops } from './shop.entity';

@Module({
  imports:[TypeOrmModule.forFeature([Shops])],
  controllers: [ShopsController],
  providers: [ShopsService]
})
export class ShopsModule {}
