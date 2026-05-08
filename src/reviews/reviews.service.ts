import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Review } from './review.entity';

export interface CreateReviewDto {
  shop_id: number;
  user_id?: number | null;
  user_name: string;
  user_avatar?: string | null;
  rating: number;
  comment: string;
}

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(Review)
    private readonly reviewsRepository: Repository<Review>,
  ) {}

  async create(dto: CreateReviewDto): Promise<Review> {
    if (!dto.shop_id) throw new BadRequestException('shop_id is required');
    if (!dto.rating || dto.rating < 1 || dto.rating > 5) {
      throw new BadRequestException('rating must be between 1 and 5');
    }
    if (!dto.comment || dto.comment.trim().length === 0) {
      throw new BadRequestException('comment is required');
    }
    const review = this.reviewsRepository.create({
      shop_id: dto.shop_id,
      user_id: dto.user_id ?? null,
      user_name: dto.user_name?.trim() || 'Anonymous',
      user_avatar: dto.user_avatar ?? null,
      rating: dto.rating,
      comment: dto.comment.trim(),
    });
    return await this.reviewsRepository.save(review);
  }

  async findByShop(shopId: number): Promise<Review[]> {
    return await this.reviewsRepository.find({
      where: { shop_id: shopId },
      order: { createdAt: 'DESC' },
    });
  }

  async getStats(shopId: number): Promise<{ count: number; average: number }> {
    const reviews = await this.reviewsRepository.find({ where: { shop_id: shopId } });
    if (reviews.length === 0) return { count: 0, average: 0 };
    const sum = reviews.reduce((acc, r) => acc + Number(r.rating), 0);
    return { count: reviews.length, average: +(sum / reviews.length).toFixed(2) };
  }
}
