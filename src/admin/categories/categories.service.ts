import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categories } from './categories.entity';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';


@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Categories)
    private readonly categoriesRepository: Repository<Categories>,
  ) {}

  // ✅ Create a category
  async create(createCategoryDto: CreateCategoryDto): Promise<Categories> {
    const category = this.categoriesRepository.create({
      ...createCategoryDto,
      is_active: true,
      createdAt: new Date(),
    });
    return await this.categoriesRepository.save(category);
  }

  // ✅ Get all categories
  async findAll(): Promise<Categories[]> {
    return await this.categoriesRepository.find();
  }

  // ✅ Get a single category by ID
  async findOne(id: number): Promise<Categories> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`Category with ID ${id} not found`);
    return category;
  }

  // ✅ Update a category
  async update(id: number, updateCategoryDto: UpdateCategoryDto): Promise<Categories> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`Category with ID ${id} not found`);

    Object.assign(category, updateCategoryDto);
    return await this.categoriesRepository.save(category);
  }

  // ✅ Delete a category
  async remove(id: number): Promise<{ message: string }> {
    const result = await this.categoriesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    return { message: `Category with ID ${id} deleted successfully` };
  }
}

