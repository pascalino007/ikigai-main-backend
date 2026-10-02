import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query, Req, UseGuards } from '@nestjs/common';
import { ServicesService } from './services.service';
import { Services } from './services.entity';
import { CreateServiceDto } from './dtos/create-service.dto';
import { UpdateServiceDto } from './dtos/update-service.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  // ✅ Create service — provider's own shop only
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'enroller', 'manager')
  @Post()
  create(@Body() dto: CreateServiceDto, @Request() req) {
    return this.servicesService.create(dto, req.user);
  }

  // ✅ Get service count (dashboard)
  @Get('stats/count')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async count(): Promise<{ count: number }> {
    const count = await this.servicesService.count();
    return { count };
  }

  // ✅ Get all services, optionally filtered by shop_grade or category
  @Get()
  async findAll(
    @Query('shop_grade') shopGrade?: string,
    @Query('category') category?: string,
  ): Promise<Services[]> {
    return await this.servicesService.findAll(shopGrade, category);
  }

  // ✅ Get service by ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Services> {
    return await this.servicesService.findOne(id);
  }
  // ✅ Get services by Shop ID
  @Get('/shop/:shopid')
  async findbyshop(@Param('shopid', ParseIntPipe) shopid: number): Promise<Services[]> {
    return await this.servicesService.findShopServices(shopid);
  }

  // ✅ Update service — provider's own shop only
  @Post(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateServiceDto: UpdateServiceDto,
    @Req() req: any,
  ): Promise<Services> {
    return await this.servicesService.update(id, updateServiceDto, req.user);
  }

  // ✅ Delete service — provider's own shop only
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider')
  async remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return await this.servicesService.remove(id, req.user);
  }
}

