import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { MiServicesService } from './mi-services.service';
import { CreateMiServiceDto } from './dtos/create-mi-service.dto';
import { CreateMiServiceCategoryDto } from './dtos/create-mi-service-category.dto';

@Controller('mi-services')
export class MiServicesController {
  constructor(private readonly service: MiServicesService) {}

  // ── Categories ──
  // NOTE: declared before ':id' routes so "categories" isn't parsed as an id.

  @Get('categories')
  findAllCategories() {
    return this.service.findAllCategories();
  }

  @Post('categories')
  createCategory(@Body() dto: CreateMiServiceCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateMiServiceCategoryDto>,
  ) {
    return this.service.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  removeCategory(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeCategory(id);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  create(@Body() dto: CreateMiServiceDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateMiServiceDto>,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  // ── Orders ──

  @Get('orders')
  findAllOrders() {
    return this.service.findAllOrders();
  }

  @Get('orders/shop/:shopId')
  findOrdersByShop(@Param('shopId', ParseIntPipe) shopId: number) {
    return this.service.findOrdersByShop(shopId);
  }

  @Patch('orders/:id/deliver')
  markOrderDelivered(@Param('id', ParseIntPipe) id: number) {
    return this.service.markOrderDelivered(id);
  }

  @Post(':id/order')
  async order(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { shopId: number; userId: number; paymentProvider?: 'kkiapay' | 'stripe' },
  ) {
    const { shopId, userId, paymentProvider } = body;
    return this.service.initiatePurchase(id, shopId, userId, paymentProvider);
  }
}
