// sous-categories.controller.ts
import { Controller, Get, Post, Delete, Param, Body, ParseIntPipe, UseGuards } from '@nestjs/common'
import { SousCategoriesService } from './sous-category.service'
import { SousCategories } from './sous-category.entity'
import { CreateSousCategoryDto } from './dtos/create-souscategory.dto'
import { UpdateSousCategoryDto } from './dtos/update-souscategory.dto'
import { JwtAuthGuard } from '../../auth/jwt-auth.guard'
import { RolesGuard } from '../../auth/roles.guard'
import { Roles } from '../../auth/roles.decorator'



@Controller('sous-categories')
export class SousCategoriesController {
  constructor(private readonly sousCategoriesService: SousCategoriesService) {}

  @Get()
  async findAll(): Promise<SousCategories[]> {
    return this.sousCategoriesService.findAll()
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<SousCategories> {
    return this.sousCategoriesService.findOne(id)
  }

  @Get('/subcate/:category')
    async findbyshop(@Param('category') category: string): Promise<SousCategories[]> {
      return  this.sousCategoriesService.findsouscategoriesby(category);
    }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager', 'enroller')
  async create(@Body() dto: CreateSousCategoryDto): Promise<SousCategories> {
    return this.sousCategoriesService.create(dto)
  }

   @Post(':id')
   @UseGuards(JwtAuthGuard, RolesGuard)
   @Roles('admin', 'manager', 'enroller')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSousCategoryDto,
  ): Promise<SousCategories> {
    return this.sousCategoriesService.update(id, dto)
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager', 'enroller')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    await this.sousCategoriesService.remove(id)
    return { message: 'SousCategory deleted successfully' }
  }
}
