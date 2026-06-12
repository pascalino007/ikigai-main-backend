import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Services } from './services.entity';
import { Categories } from '../admin/categories/categories.entity';
import { SousCategories } from '../admin/sous-category/sous-category.entity';
import { Shops } from '../shops/shop.entity';
import { CreateServiceDto } from './dtos/create-service.dto';
import { UpdateServiceDto } from './dtos/update-service.dto';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Services)
    private readonly servicesRepository: Repository<Services>,
    @InjectRepository(Categories)
    private readonly categoriesRepository: Repository<Categories>,
    @InjectRepository(SousCategories)
    private readonly sousCategoriesRepository: Repository<SousCategories>,
    @InjectRepository(Shops)
    private readonly shopsRepository: Repository<Shops>,
  ) {}

  private async enrich(items: Services[]): Promise<(Services & { categoryName: string; sousCategoryName: string; shop_latitude?: number; shop_longitude?: number; shop_name?: string; shop_address?: string; shop_grade?: string; shop_profileImageUrl?: string })[]> {
    const [cats, scats, shops] = await Promise.all([
      this.categoriesRepository.find(),
      this.sousCategoriesRepository.find(),
      this.shopsRepository.find(),
    ]);
    const catMap = new Map(cats.map(c => [String(c.id), c.name]));
    const scatMap = new Map(scats.map(s => [String(s.id), s.name]));
    const shopMap = new Map(shops.map(s => [String(s.id), s]));
    return items.map(item => {
      const shop = shopMap.get(String(item.provider_id));
      return {
        ...item,
        categoryName: catMap.get(item.Category) ?? item.Category ?? '',
        sousCategoryName: scatMap.get(item.sous_category) ?? item.sous_category ?? '',
        shop_latitude: shop?.latitude ?? undefined,
        shop_longitude: shop?.longitude ?? undefined,
        shop_name: shop?.name ?? undefined,
        shop_address: shop?.address ?? undefined,
        shop_grade: shop?.grade ?? 'basic',
        shop_profileImageUrl: shop?.profileImageUrl ?? undefined,
      };
    });
  }

  // ✅ Create a service
  async create(createServiceDto: CreateServiceDto): Promise<Services> {
    const service = this.servicesRepository.create({
      ...createServiceDto,
      is_active: true,
      createdAt: new Date(),
    });
    return await this.servicesRepository.save(service);
  }

  // ✅ Get all services, optionally filtered by shop_grade or category
  async findAll(shopGrade?: string, category?: string): Promise<(Services & { categoryName: string; sousCategoryName: string })[]> {
    let items: Services[];
    if (category) {
      // Category param may be ID or name; look up both to match Services.Category
      const cat = await this.categoriesRepository.findOne({ where: { id: Number(category) || 0 } });
      const categoryName = cat?.name ?? category;
      items = await this.servicesRepository.find({
        where: [{ Category: category }, { Category: categoryName }],
      });
      // Fallback: if strict filter yields nothing, return all services for the grade
      if (items.length === 0) {
        items = await this.servicesRepository.find();
      }
    } else {
      items = await this.servicesRepository.find();
    }
    const enriched = await this.enrich(items);
    if (shopGrade) {
      const target = shopGrade.toLowerCase();
      return enriched.filter(s => (s.shop_grade ?? 'basic').toLowerCase() === target);
    }
    return enriched;
  }

  // ✅ Get one service
  async findOne(id: number): Promise<Services & { categoryName: string; sousCategoryName: string }> {
    const service = await this.servicesRepository.findOne({ where: { id } });
    if (!service) throw new NotFoundException(`Service with ID ${id} not found`);
    const [enriched] = await this.enrich([service]);
    return enriched;
  }

  // ✅ Get services by provider/shop ID
  async findShopServices(id: number): Promise<(Services & { categoryName: string; sousCategoryName: string })[]> {
    const items = await this.servicesRepository.find({ where: { provider_id: id } });
    return this.enrich(items);
  }

  // ✅ Update a service
  async update(id: number, updateServiceDto: UpdateServiceDto): Promise<Services> {
    const service = await this.servicesRepository.findOne({ where: { id } });
    if (!service) throw new NotFoundException(`Service with ID ${id} not found`);
    Object.assign(service, updateServiceDto);
    return await this.servicesRepository.save(service);
  }

  // ✅ Count services
  async count(): Promise<number> {
    return this.servicesRepository.count();
  }

  // ✅ Delete a service
  async remove(id: number): Promise<{ message: string }> {
    const result = await this.servicesRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Service with ID ${id} not found`);
    }
    return { message: `Service with ID ${id} deleted successfully` };
  }
}

