import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { MarketplaceService } from './marketplace.service';
import { CreateProductDto } from './dtos/create-product.dto';
import { UpdateProductDto } from './dtos/update-product.dto';
import { Product } from './product.entity';

@Controller('marketplace/products')
export class MarketplaceController {
  constructor(private readonly marketplaceService: MarketplaceService) {}

  @Post()
  async create(@Body() createProductDto: CreateProductDto): Promise<Product> {
    return await this.marketplaceService.create(createProductDto);
  }

  @Get()
  async findAll(): Promise<Product[]> {
    return await this.marketplaceService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Product> {
    return await this.marketplaceService.findOne(id);
  }

  @Post(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
  ): Promise<Product> {
    return await this.marketplaceService.update(id, updateProductDto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return await this.marketplaceService.remove(id);
  }
}
