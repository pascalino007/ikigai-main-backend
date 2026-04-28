import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EnrollersController } from './enrollers.controller';
import { EnrollersService } from './enrollers.service';
import { Users } from '../users/user.entity';
import { Shops } from '../shops/shop.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Users, Shops])],
  controllers: [EnrollersController],
  providers: [EnrollersService],
  exports: [EnrollersService],
})
export class EnrollersModule {}
