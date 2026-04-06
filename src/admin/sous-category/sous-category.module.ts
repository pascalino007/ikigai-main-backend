import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SousCategories } from './sous-category.entity';
import { Categories } from '../categories/categories.entity';
import { SousCategoriesController } from './sous-category.controller';
import { SousCategoriesService } from './sous-category.service';
@Module({
  imports: [TypeOrmModule.forFeature([SousCategories, Categories])],
  controllers: [SousCategoriesController],
  providers: [SousCategoriesService]
})
export class SousCategoryModule {}
