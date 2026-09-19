import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  Query,
  Req,
  UseGuards,
  DefaultValuePipe,
} from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly service: SubscriptionsService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  findAll() {
    return this.service.findAll();
  }

  @Get('user/:userId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  findByUser(@Param('userId', ParseIntPipe) userId: number, @Req() req: any) {
    return this.service.findByUser(userId, req.user);
  }

  @Get('shop/:shopId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  findByShop(@Param('shopId', ParseIntPipe) shopId: number, @Req() req: any) {
    return this.service.findByShop(shopId, req.user);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  create(@Body() body: any, @Req() req: any) {
    return this.service.create(body, req.user);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  update(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  // Public: pricing shown before/without requiring a session.
  @Get('plans')
  findAllPlans() {
    return this.service.findAllPlans();
  }

  @Post('plans/seed')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  seedPlans() {
    return this.service.seedPlans();
  }

  @Post('plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  createPlan(@Body() body: any) {
    return this.service.createPlan(body);
  }

  @Put('plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  updatePlan(@Param('id', ParseIntPipe) id: number, @Body() body: any) {
    return this.service.updatePlan(id, body);
  }

  @Delete('plans/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  removePlan(@Param('id', ParseIntPipe) id: number) {
    return this.service.removePlan(id);
  }

  @Get('history')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  getHistory(
    @Query('userId', new DefaultValuePipe(0), ParseIntPipe) userId: number,
    @Query('shopId', new DefaultValuePipe(0), ParseIntPipe) shopId: number,
  ) {
    return this.service.findHistory(userId, shopId);
  }
}
