import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shops } from './shop.entity';
import { Users } from '../users/user.entity';
import { CreateShopDto } from './dtos/create-shop.dto';
import { UpdateShopDto } from './dtos/update-shop.dto';

const GRADE_POINTS: Record<string, number> = { basic: 10, pro: 30, elite: 50 };

@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shops)
    private readonly shopsRepository: Repository<Shops>,
    @InjectRepository(Users)
    private readonly usersRepository: Repository<Users>,
  ) {}

  // ✅ Create a new shop — awards points to enroller if registered_by is a numeric enroller ID
  // Also links shop to provider user via owner email
  async create(createShopDto: CreateShopDto): Promise<Shops> {
    const newShop = this.shopsRepository.create(createShopDto);

    // Link shop to provider user via owner email
    if (createShopDto.owner) {
      const provider = await this.usersRepository.findOne({
        where: { email: createShopDto.owner, role: 'provider' },
      });
      if (provider) {
        newShop.user_id = provider.id;
      }
    }

    const savedShop = await this.shopsRepository.save(newShop);

    const enrollerId = parseInt(createShopDto.registered_by, 10);
    if (!isNaN(enrollerId)) {
      const enroller = await this.usersRepository.findOne({ where: { id: enrollerId, role: 'enroller' } });
      if (enroller) {
        const grade = createShopDto.grade || 'basic';
        enroller.points = (enroller.points || 0) + (GRADE_POINTS[grade] ?? 10);
        await this.usersRepository.save(enroller);
      }
    }

    return savedShop;
  }

  // ✅ Update an existing shop
   async update(id: number, updateShopDto: UpdateShopDto): Promise<Shops> {
    const shop = await this.shopsRepository.findOne({ where: { id } });

    if (!shop) {
      throw new NotFoundException(`Shop with ID ${id} not found`);
    }

    Object.assign(shop, updateShopDto);

    // Re-link provider by owner email whenever owner changes
    if (updateShopDto.owner !== undefined) {
      if (updateShopDto.owner) {
        const provider = await this.usersRepository.findOne({
          where: { email: updateShopDto.owner, role: 'provider' },
        });
        shop.user_id = provider ? provider.id : null;
      } else {
        shop.user_id = null;
      }
    }

    return await this.shopsRepository.save(shop);
  } 

  // ✅ (Optional) Get all shops, optionally filtered by grade
  async findAll(grade?: string): Promise<Shops[]> {
    if (grade) {
      return await this.shopsRepository.find({ where: { grade: grade as any } });
    }
    return await this.shopsRepository.find();
  }

  // ✅ Toggle shop visibility on mobile app
  async toggleActive(id: number): Promise<Shops> {
    const shop = await this.shopsRepository.findOne({ where: { id } });
    if (!shop) throw new NotFoundException(`Shop with ID ${id} not found`);
    shop.is_active = !shop.is_active;
    return await this.shopsRepository.save(shop);
  }

  // ✅ Update shop status (open|busy|closed)
  async updateStatus(id: number, status: 'open' | 'busy' | 'closed'): Promise<Shops> {
    if (!['open', 'busy', 'closed'].includes(status)) {
      throw new NotFoundException(`Invalid status: ${status}`);
    }
    const shop = await this.shopsRepository.findOne({ where: { id } });
    if (!shop) throw new NotFoundException(`Shop with ID ${id} not found`);
    shop.status = status;
    return await this.shopsRepository.save(shop);
  }

  // ✅ Toggle shop verification status (only if certificationImage exists)
  async toggleVerification(id: number): Promise<Shops> {
    const shop = await this.shopsRepository.findOne({ where: { id } });
    if (!shop) throw new NotFoundException(`Shop with ID ${id} not found`);
    if (!shop.certificationImage) {
      throw new Error('Cannot verify shop without certification image');
    }
    shop.is_verified = !shop.is_verified;
    return await this.shopsRepository.save(shop);
  }

  // ✅ (Optional) Get a single shop by ID
  async findOne(id: number): Promise<Shops> {
    const shop = await this.shopsRepository.findOne({ where: { id } });
    if (!shop) throw new NotFoundException(`Shop with ID ${id} not found`);
    return shop;
  }

  // ✅ (Optional) Delete shop
  async remove(id: number): Promise<void> {
    const result = await this.shopsRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Shop with ID ${id} not found`);
    }
  }
}
