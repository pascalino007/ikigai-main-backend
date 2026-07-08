import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Categories } from './categories.entity';
import { CreateCategoryDto } from './dtos/create-category.dto';
import { UpdateCategoryDto } from './dtos/update-category.dto';
import { RedisService } from '../../redis/redis.service';

/** Near-static data → cache longer; writes invalidate immediately. */
const TTL = 300;

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Categories)
    private readonly categoriesRepository: Repository<Categories>,
    private readonly redis: RedisService,
  ) {}

  private invalidate(): Promise<void> {
    return this.redis.delPattern('cat:*');
  }

  // ✅ Create a category
  async create(createCategoryDto: CreateCategoryDto): Promise<Categories> {
    const category = this.categoriesRepository.create({
      ...createCategoryDto,
      is_active: true,
      createdAt: new Date(),
    });
    const saved = await this.categoriesRepository.save(category);
    await this.invalidate();
    return saved;
  }

  // ✅ Get all categories (cached)
  async findAll(): Promise<Categories[]> {
    return this.redis.remember('cat:all', TTL, () => this.categoriesRepository.find());
  }

  // ✅ Get a single category by ID (cached)
  async findOne(id: number): Promise<Categories> {
    return this.redis.remember(`cat:one:${id}`, TTL, async () => {
      const category = await this.categoriesRepository.findOne({ where: { id } });
      if (!category) throw new NotFoundException(`Category with ID ${id} not found`);
      return category;
    });
  }

  // ✅ Update a category
  async update(id: number, updateCategoryDto: UpdateCategoryDto): Promise<Categories> {
    const category = await this.categoriesRepository.findOne({ where: { id } });
    if (!category) throw new NotFoundException(`Category with ID ${id} not found`);

    Object.assign(category, updateCategoryDto);
    const saved = await this.categoriesRepository.save(category);
    await this.invalidate();
    return saved;
  }

  // ✅ Delete a category
  async remove(id: number): Promise<{ message: string }> {
    const result = await this.categoriesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Category with ID ${id} not found`);
    }
    await this.invalidate();
    return { message: `Category with ID ${id} deleted successfully` };
  }
}
