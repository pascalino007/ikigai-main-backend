// sous-categories.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { Repository } from 'typeorm'
import { InjectRepository } from '@nestjs/typeorm'
import { SousCategories } from './sous-category.entity'
import { CreateSousCategoryDto } from './dtos/create-souscategory.dto'


@Injectable()
export class SousCategoriesService {

  
  constructor(
    @InjectRepository(SousCategories)
    private readonly sousCategoryRepo: Repository<SousCategories>,
  ) {}

  async findsouscategoriesby(category: string):  Promise<SousCategories[]> {
    const souscat =   await this.sousCategoryRepo.find({ where: { category:category } });
    return souscat;
  }

  async findAll(): Promise<SousCategories[]> {
    return this.sousCategoryRepo.find()
  }

  async findOne(id: number): Promise<SousCategories> {
    const category = await this.sousCategoryRepo.findOne({ where: { id } })
    if (!category) throw new NotFoundException('SousCategory not found')
    return category
  }

  async create(dto: CreateSousCategoryDto): Promise<SousCategories> {
    const newCategory = this.sousCategoryRepo.create({
      ...dto,
      is_active:  true,
      createdAt: new Date(),
    })
    return this.sousCategoryRepo.save(newCategory)
  }

/*   async update(id: number, dto: UpdateSousCategoryDto): Promise<SousCategories> {
    const category = await this.findOne(id)
    Object.assign(category, dto)
    return this.sousCategoryRepo.save(category)
  } */

  async remove(id: number): Promise<void> {
    const category = await this.findOne(id)
    await this.sousCategoryRepo.remove(category)
  }
}

