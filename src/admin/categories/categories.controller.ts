import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { CategoriesService } from './categories.service';

import { Categories } from './categories.entity';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ✅ Create category
  @Post()
  async create(@Body() createCategoryDto: CreateCategoryDto): Promise<Categories> {
    return await this.categoriesService.create(createCategoryDto);
  }

  // ✅ Get all categories
  @Get()
  async findAll(): Promise<Categories[]> {
    return await this.categoriesService.findAll();
  }

  // ✅ Get category by ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Categories> {
    return await this.categoriesService.findOne(id);
  }

  // ✅ Update category
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<Categories> {
    return await this.categoriesService.update(id, updateCategoryDto);
  }

  // ✅ Delete category
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.categoriesService.remove(id);
  }
}
