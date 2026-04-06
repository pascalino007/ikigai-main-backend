import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Special } from './special.entity';
import { Shops } from '../shops/shop.entity';
import { CreateSpecialDto } from './dtos/create-special.dto';
import { UpdateSpecialDto } from './dtos/update-special.dto';


@Injectable()
export class SpecialsService {
  constructor(
    @InjectRepository(Special)
    private readonly repo: Repository<Special>,
    @InjectRepository(Shops)
    private readonly shopsRepo: Repository<Shops>,
  ) {}

  /** Enrich specials with shop lat/lng for mobile distance calculation */
  private async enrichWithShop(specials: Special[]) {
    const shopIds = [...new Set(specials.map(s => s.shopId).filter(Boolean))];
    if (shopIds.length === 0) return specials.map(s => ({ ...s }));
    const shops = await this.shopsRepo.findByIds(shopIds);
    const shopMap = new Map(shops.map(s => [String(s.id), s]));
    return specials.map(s => {
      const shop = shopMap.get(String(s.shopId));
      return {
        ...s,
        shop_latitude: shop?.latitude ?? null,
        shop_longitude: shop?.longitude ?? null,
        shop_name: shop?.name ?? null,
        shop_address: shop?.address ?? null,
      };
    });
  }

  async create(dto: CreateSpecialDto): Promise<Special> {
    // Convert date strings to Date if present
    const payload: Partial<Special> = { ...dto } as any;
    if (dto.startDate) payload.startDate = new Date(dto.startDate);
    if (dto.endDate) payload.endDate = new Date(dto.endDate);

    const special = this.repo.create(payload);
    return this.repo.save(special);
  }

 

  async findAll() {
    const specials = await this.repo.find({ order: { createdAt: 'DESC' } });
    return this.enrichWithShop(specials);
  }

  async findOne(id: string): Promise<Special> {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Special not found.');
    return s;
  }

  async update(id: string, dto: UpdateSpecialDto): Promise<Special> {
    const special = await this.findOne(id);
    Object.assign(special, dto);

    if (dto.startDate) special.startDate = new Date(dto.startDate as any);
    if (dto.endDate) special.endDate = new Date(dto.endDate as any);

    return this.repo.save(special);
  }

  async remove(id: string): Promise<void> {
    const result = await this.repo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Special not found.');
  }

  // optional helper: mark a use (checks maxUses)
  async markUse(id: string): Promise<Special> {
    const special = await this.findOne(id);
    if (special.maxUses && special.uses >= special.maxUses) {
      throw new BadRequestException('Special max uses reached.');
    }
    special.uses += 1;
    return this.repo.save(special);
  }
}

