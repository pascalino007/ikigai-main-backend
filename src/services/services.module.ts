import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Services } from './services.entity';
import { Categories } from '../admin/categories/categories.entity';
import { SousCategories } from '../admin/sous-category/sous-category.entity';
import { Shops } from '../shops/shop.entity';

@Module({
  imports:[TypeOrmModule.forFeature([Services, Categories, SousCategories, Shops])],
  controllers: [ServicesController],
  providers: [ServicesService]
})
export class ServicesModule {}
