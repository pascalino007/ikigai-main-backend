// sous-categories.controller.ts
import { Controller, Get, Post, Put, Delete, Param, Body, ParseIntPipe } from '@nestjs/common'
import { SousCategoriesService } from './sous-category.service'
import { SousCategories } from './sous-category.entity'
import { CreateSousCategoryDto } from './dtos/create-souscategory.dto'



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
  async create(@Body() dto: CreateSousCategoryDto): Promise<SousCategories> {
    return this.sousCategoriesService.create(dto)
  }

/*   @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSousCategoryDto,
  ): Promise<SousCategories> {
    return this.sousCategoriesService.update(id, dto)
  } */

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    await this.sousCategoriesService.remove(id)
    return { message: 'SousCategory deleted successfully' }
  }
}
