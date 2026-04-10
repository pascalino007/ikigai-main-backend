import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DeepPartial, Repository } from 'typeorm';
import { Slider } from './sliders.entity';
import { CreateSliderDto, UpdateSliderDto } from './dto/create-slider.dto';

@Injectable()
export class SlidersService {
  constructor(
    @InjectRepository(Slider)
    private readonly sliderRepo: Repository<Slider>,
  ) {}

  async findAll(): Promise<Slider[]> {
    return this.sliderRepo.find({ order: { order: 'ASC', createdAt: 'DESC' } });
  }

  /** Public — only active + current sliders (for mobile app promo cards) */
  async findCurrent(): Promise<Slider[]> {
    return this.sliderRepo.find({
      where: { isActive: true, isCurrent: true },
      order: { order: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Slider> {
    const slider = await this.sliderRepo.findOne({ where: { id } });
    if (!slider) throw new NotFoundException(`Slider #${id} not found`);
    return slider;
  }

  async create(dto: CreateSliderDto, imageUrl?: string): Promise<Slider> {
    const sliderData: DeepPartial<Slider> = {
      ...dto,
      imageUrl: imageUrl ?? undefined,
    };
    const slider = this.sliderRepo.create(sliderData);
    return this.sliderRepo.save(Array.isArray(slider) ? slider[0] : slider);
  }

  async update(id: number, dto: UpdateSliderDto, imageUrl?: string): Promise<Slider> {
    const slider = await this.findOne(id);
    Object.assign(slider, dto);
    if (imageUrl) slider.imageUrl = imageUrl;
    return this.sliderRepo.save(slider);
  }

  async remove(id: number): Promise<void> {
    const slider = await this.findOne(id);
    await this.sliderRepo.remove(slider);
  }
}
