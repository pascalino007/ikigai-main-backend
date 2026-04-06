// sous-categories.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { SousCategories } from './sous-category.entity'
import { Categories } from '../categories/categories.entity'
import { CreateSousCategoryDto } from './dtos/create-souscategory.dto'
import { UpdateSousCategoryDto } from './dtos/update-souscategory.dto'


@Injectable()
export class SousCategoriesService {

  constructor(
    @InjectRepository(SousCategories)
    private readonly sousCategoryRepo: Repository<SousCategories>,
    @InjectRepository(Categories)
    private readonly categoryRepo: Repository<Categories>,
  ) {}

  private async enrichWithCategoryName(
    items: SousCategories[],
  ): Promise<(SousCategories & { categoryName: string })[]> {
    const cats = await this.categoryRepo.find()
    const catMap = new Map(cats.map(c => [String(c.id), c.name]))
    return items.map(item => ({
      ...item,
      categoryName: catMap.get(item.category) ?? item.category,
    }))
  }

  async findsouscategoriesby(category: string): Promise<(SousCategories & { categoryName: string })[]> {
    const items = await this.sousCategoryRepo.find({ where: { category } })
    return this.enrichWithCategoryName(items)
  }

  async findAll(): Promise<(SousCategories & { categoryName: string })[]> {
    const items = await this.sousCategoryRepo.find()
    return this.enrichWithCategoryName(items)
  }

  async findOne(id: number): Promise<SousCategories & { categoryName: string }> {
    const item = await this.sousCategoryRepo.findOne({ where: { id } })
    if (!item) throw new NotFoundException('SousCategory not found')
    const [enriched] = await this.enrichWithCategoryName([item])
    return enriched
  }

  async create(dto: CreateSousCategoryDto): Promise<SousCategories> {
    const newCategory = this.sousCategoryRepo.create({
      ...dto,
      is_active:  true,
      createdAt: new Date(),
    })
    return this.sousCategoryRepo.save(newCategory)
  }

  async update(id: number, dto: UpdateSousCategoryDto): Promise<SousCategories> {
    const category = await this.sousCategoryRepo.findOne({ where: { id } })
    if (!category) throw new NotFoundException('SousCategory not found')
    Object.assign(category, dto)
    return this.sousCategoryRepo.save(category)
  }

  async remove(id: number): Promise<void> {
    const category = await this.sousCategoryRepo.findOne({ where: { id } })
    if (!category) throw new NotFoundException('SousCategory not found')
    await this.sousCategoryRepo.remove(category)
  }
}
