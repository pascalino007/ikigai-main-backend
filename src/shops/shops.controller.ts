import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  ParseIntPipe,
  Query,
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

  // ✅ Get shop count
  @Get('stats/count')
  async count(): Promise<{ count: number }> {
    const count = await this.shopsService.count();
    return { count };
  }

  // ✅ Get all shops, optionally filtered by grade (basic|pro|elite)
  @Get()
  async findAll(@Query('grade') grade?: string): Promise<Shops[]> {
    return await this.shopsService.findAll(grade);
  }

  // ✅ Toggle shop visibility on mobile app
  @Patch(':id/toggle-active')
  async toggleActive(@Param('id', ParseIntPipe) id: number): Promise<Shops> {
    return await this.shopsService.toggleActive(id);
  }

  // ✅ Toggle shop verification status
  @Post(':id/toggle-verification')
  async toggleVerification(@Param('id', ParseIntPipe) id: number): Promise<Shops> {
    return await this.shopsService.toggleVerification(id);
  }

  // ✅ Update shop status (ouvert|occupé|free|closed)
  @Patch(':id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'open' | 'ouvert' | 'occupé' | 'free' | 'closed',
  ): Promise<Shops> {
    return await this.shopsService.updateStatus(id, status);
  }

  // ✅ Get one shop by ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Shops> {
    return await this.shopsService.findOne(id);
  }

  // ✅ Update a shop by ID
  @Post('update/:id')
async update(
  @Param('id', ParseIntPipe) id: number,
  @Body() updateShopDto: UpdateShopDto,
): Promise<Shops> {
  return await this.shopsService.update(id, updateShopDto);
}


  // ✅ Update FCM token for push notifications
  @Post(':id/fcm-token')
  async updateFcmToken(
    @Param('id', ParseIntPipe) id: number,
    @Body('fcmToken') fcmToken: string,
  ): Promise<Shops> {
    return await this.shopsService.updateFcmToken(id, fcmToken);
  }

  // ✅ Delete a shop by ID
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    await this.shopsService.remove(id);
    return { message: `Shop with ID ${id} deleted successfully` };
  }
}
