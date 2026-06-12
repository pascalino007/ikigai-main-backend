import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query } from '@nestjs/common';
import { MiServicesService } from './mi-services.service';
import { CreateMiServiceDto } from './dtos/create-mi-service.dto';

@Controller('mi-services')
export class MiServicesController {
  constructor(private readonly service: MiServicesService) {}

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

  @Post(':id/order')
  async order(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { shopId: number; userId: number; paymentProvider?: 'kkiapay' | 'stripe' },
  ) {
    const { shopId, userId, paymentProvider } = body;
    return this.service.initiatePurchase(id, shopId, userId, paymentProvider);
  }
}
