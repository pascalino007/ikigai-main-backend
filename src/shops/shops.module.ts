import { Module } from '@nestjs/common';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Shops } from './shop.entity';
import { Users } from '../users/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Shops, Users])],
  controllers: [ShopsController],
  providers: [ShopsService],
  exports: [ShopsService],
})
export class ShopsModule {}
