import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe, Query } from '@nestjs/common';
import { ServicesService } from './services.service';
import { Services } from './services.entity';
import { CreateServiceDto } from './dtos/create-service.dto';
import { UpdateServiceDto } from './dtos/update-service.dto';

@Controller('services')
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  // ✅ Create service
  @Post()
  async create(@Body() createServiceDto: CreateServiceDto): Promise<Services> {
    return await this.servicesService.create(createServiceDto);
  }

  // ✅ Get service count
  @Get('stats/count')
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

  // ✅ Update service
  @Post(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateServiceDto: UpdateServiceDto,
  ): Promise<Services> {
    return await this.servicesService.update(id, updateServiceDto);
  }

  // ✅ Delete service
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.servicesService.remove(id);
  }
}

