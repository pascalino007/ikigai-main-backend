import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';

import { Categories } from './categories.entity';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // ✅ Create category
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
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
  @Post('update/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCategoryDto: UpdateCategoryDto,
  ): Promise<Categories> {
    return await this.categoriesService.update(id, updateCategoryDto);
  }

  // ✅ Delete category
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.categoriesService.remove(id);
  }
}
