import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  Query,
  DefaultValuePipe,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get('user/:userId')
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.service.findByUser(userId);
  }

  @Get('shop/:shopId')
  findByShop(@Param('shopId', ParseIntPipe) shopId: number) {
    return this.service.findByShop(shopId);
  }

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Get('plans')
  findAllPlans() {
    return this.service.findAllPlans();
  }

  @Post('plans/seed')
  seedPlans() {
    return this.service.seedPlans();
  }

  @Post('plans')
  createPlan(@Body() body: any) {
    return this.service.createPlan(body);
  }

  @Put('plans/:id')
  updatePlan(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.updatePlan(id, body);
  }

  @Delete('plans/:id')
  removePlan(@Param('id', ParseIntPipe) id: number) {
    return this.service.removePlan(id);
  }

  @Get('history')
  getHistory(
    @Query('userId', new DefaultValuePipe(0), ParseIntPipe) userId: number,
    @Query('shopId', new DefaultValuePipe(0), ParseIntPipe) shopId: number,
  ) {
    return this.service.findHistory(userId, shopId);
  }
}
