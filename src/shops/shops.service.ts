import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Shops } from './shop.entity';
import { CreateShopDto } from './dtos/create-shop.dto';
import { UpdateShopDto } from './dtos/update-shop.dto';


@Injectable()
export class ShopsService {
  constructor(
    @InjectRepository(Shops)
    private readonly shopsRepository: Repository<Shops>,
  ) {}

  // ✅ Create a new shop
  async create(createShopDto: CreateShopDto): Promise<Shops> {
    const newShop = this.shopsRepository.create(createShopDto);
    return await this.shopsRepository.save(newShop);
  }

  // ✅ Update an existing shop
   async update(id: number, updateShopDto: UpdateShopDto): Promise<Shops> {
    const shop = await this.shopsRepository.findOne({ where: { id } });

    if (!shop) {
      throw new NotFoundException(`Shop with ID ${id} not found`);
    }

    Object.assign(shop, updateShopDto);
    return await this.shopsRepository.save(shop);
  } 

  // ✅ (Optional) Get all shops
  async findAll(): Promise<Shops[]> {
    return await this.shopsRepository.find();
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
