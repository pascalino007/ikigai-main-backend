import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import type { CreateReviewDto } from './reviews.service';
import { ReviewsService } from './reviews.service';

@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  async create(@Body() dto: CreateReviewDto) {
    return await this.reviewsService.create(dto);
  }

  @Get('shop/:id')
  async findByShop(@Param('id', ParseIntPipe) id: number) {
    return await this.reviewsService.findByShop(id);
  }

  @Get('shop/:id/stats')
  async stats(@Param('id', ParseIntPipe) id: number) {
    return await this.reviewsService.getStats(id);
  }
}
