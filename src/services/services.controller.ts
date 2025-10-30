import { Controller, Get, Post, Body, Patch, Param, Delete, ParseIntPipe } from '@nestjs/common';
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

  // ✅ Get all services
  @Get()
  async findAll(): Promise<Services[]> {
    return await this.servicesService.findAll();
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
  @Patch(':id')
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

