import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from './subscription.entity';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly repo: Repository<Subscription>,
  ) {}

  async findAll(): Promise<Subscription[]> {
    return this.repo.find({ order: { created_at: 'DESC' } });
  }

  async findByUser(userId: number): Promise<Subscription | null> {
    return this.repo.findOne({
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });
  }

  async findByShop(shopId: number): Promise<Subscription | null> {
    return this.repo.findOne({
      where: { shop_id: shopId },
      order: { created_at: 'DESC' },
    });
  }

  async create(data: Partial<Subscription>): Promise<Subscription> {
    const sub = this.repo.create(data);
    return this.repo.save(sub);
  }

  async update(id: number, data: Partial<Subscription>): Promise<Subscription> {
    const sub = await this.repo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException(`Subscription #${id} not found`);
    Object.assign(sub, data);
    return this.repo.save(sub);
  }

  async remove(id: number): Promise<void> {
    const sub = await this.repo.findOne({ where: { id } });
    if (!sub) throw new NotFoundException(`Subscription #${id} not found`);
    await this.repo.remove(sub);
  }
}
