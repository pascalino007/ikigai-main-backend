import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { MiServicesService } from './mi-services.service';
import { CreateMiServiceDto } from './dtos/create-mi-service.dto';
import { CreateMiServiceCategoryDto } from './dtos/create-mi-service-category.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  createCategory(@Body() dto: CreateMiServiceCategoryDto) {
    return this.service.createCategory(dto);
  }

  @Patch('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  updateCategory(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateMiServiceCategoryDto>,
  ) {
    return this.service.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  removeCategory(@Param('id', ParseIntPipe) id: number) {
    return this.service.removeCategory(id);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  create(@Body() dto: CreateMiServiceDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateMiServiceDto>,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  // ── Orders ──

  @Get('orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  findAllOrders() {
    return this.service.findAllOrders();
  }

  @Get('orders/shop/:shopId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  findOrdersByShop(@Param('shopId', ParseIntPipe) shopId: number, @Req() req: any) {
    return this.service.findOrdersByShop(shopId, req.user.id);
  }

  @Patch('orders/:id/deliver')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  markOrderDelivered(@Param('id', ParseIntPipe) id: number) {
    return this.service.markOrderDelivered(id);
  }

  @Post('order-bulk')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider')
  async orderBulk(
    @Body()
    body: {
      miServiceIds: number[];
      shopId: number;
      paymentProvider?: 'kkiapay' | 'paygate' | 'wallet';
      phone?: string;
      network?: string;
    },
    @Req() req: any,
  ) {
    const { miServiceIds, shopId, paymentProvider, phone, network } = body;
    // userId is always the caller — never trust a body-supplied one here.
    return this.service.initiateBulkPurchase(miServiceIds, shopId, req.user.id, paymentProvider, phone, network);
  }

  @Post(':id/order')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider')
  async order(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      shopId: number;
      paymentProvider?: 'kkiapay' | 'stripe' | 'paygate' | 'wallet';
      phone?: string;
      network?: string;
    },
    @Req() req: any,
  ) {
    const { shopId, paymentProvider, phone, network } = body;
    return this.service.initiatePurchase(id, shopId, req.user.id, paymentProvider, phone, network);
  }
}
