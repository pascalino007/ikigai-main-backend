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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ShopsService } from './shops.service';
import { CreateShopDto } from './dtos/create-shop.dto';
import { Shops } from './shop.entity';
import { UpdateShopDto } from './dtos/update-shop.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';


@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  // ✅ Create a new shop — provider self-service, or staff onboarding on a provider's behalf
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  async create(@Body() createShopDto: CreateShopDto, @Req() req: any): Promise<Shops> {
    return await this.shopsService.create(createShopDto, req.user);
  }

  // ✅ Get shop count (dashboard)
  @Get('stats/count')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async count(): Promise<{ count: number }> {
    const count = await this.shopsService.count();
    return { count };
  }

  // ✅ Most-visited shops leaderboard (dashboard)
  @Get('stats/most-visited')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async mostVisited(@Query('limit') limit?: string): Promise<Shops[]> {
    return await this.shopsService.findMostVisited(limit ? parseInt(limit, 10) : 10);
  }

  // ✅ Record a client visit (called by the mobile app when a shop is opened)
  @Post(':id/visit')
  async recordVisit(@Param('id', ParseIntPipe) id: number): Promise<{ id: number; views: number }> {
    return await this.shopsService.recordVisit(id);
  }

  // ✅ Get all shops, optionally filtered by grade (basic|pro|elite) and/or country ("pays").
  // Pass random=true for shuffled order (client-facing discovery screens); omitted for
  // callers like the admin dashboard that expect a stable order.
  @Get()
  async findAll(
    @Query('grade') grade?: string,
    @Query('pays') pays?: string,
    @Query('random') random?: string,
  ): Promise<Shops[]> {
    return await this.shopsService.findAll(grade, pays, random === 'true');
  }

  // ✅ Toggle shop visibility on mobile app (admin moderation)
  @Patch(':id/toggle-active')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async toggleActive(@Param('id', ParseIntPipe) id: number): Promise<Shops> {
    return await this.shopsService.toggleActive(id);
  }

  // ✅ Toggle shop verification status (admin-only: self-attested verification would be meaningless)
  @Post(':id/toggle-verification')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async toggleVerification(@Param('id', ParseIntPipe) id: number): Promise<Shops> {
    return await this.shopsService.toggleVerification(id);
  }

  // ✅ Update shop status (ouvert|occupé|free|closed) — provider's own shop only
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: 'open' | 'ouvert' | 'occupé' | 'free' | 'closed',
    @Req() req: any,
  ): Promise<Shops> {
    return await this.shopsService.updateStatus(id, status, req.user);
  }

  // ✅ Get one shop by ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Shops> {
    return await this.shopsService.findOne(id);
  }

  // ✅ Update a shop by ID — provider's own shop, or staff on a provider's behalf
  @Post('update/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateShopDto: UpdateShopDto,
    @Req() req: any,
  ): Promise<Shops> {
    return await this.shopsService.update(id, updateShopDto, req.user);
  }


  // ✅ Update FCM token for push notifications — provider's own shop only
  @Post(':id/fcm-token')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider')
  async updateFcmToken(
    @Param('id', ParseIntPipe) id: number,
    @Body('fcmToken') fcmToken: string,
    @Req() req: any,
  ): Promise<Shops> {
    return await this.shopsService.updateFcmToken(id, fcmToken, req.user);
  }

  // ✅ Delete a shop by ID (admin-only)
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  async remove(@Param('id', ParseIntPipe) id: number): Promise<{ message: string }> {
    await this.shopsService.remove(id);
    return { message: `Shop with ID ${id} deleted successfully` };
  }
}
