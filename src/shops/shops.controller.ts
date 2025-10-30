import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
} from '@nestjs/common';
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dtos/create-shop.dto';
import { Shops } from './shop.entity';
import { UpdateShopDto } from './dtos/update-shop.dto';


@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  // ✅ Create a new shop
  @Post()
  async create(@Body() createShopDto: CreateShopDto): Promise<Shops> {
    return await this.shopsService.create(createShopDto);
  }

  // ✅ Get all shops
  @Get()
  async findAll(): Promise<Shops[]> {
    return await this.shopsService.findAll();
  }

  // ✅ Get one shop by ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Shops> {
    return await this.shopsService.findOne(id);
  }

  // ✅ Update a shop by ID
  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateShopDto: UpdateShopDto,
  ): Promise<Shops> {
    return await this.shopsService.update(id, updateShopDto);
  }

  // ✅ Delete a shop by ID
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    await this.shopsService.remove(id);
    return { message: `Shop with ID ${id} deleted successfully` };
  }
}
