import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { CommandesService } from './commandes.service';
import { CreateCommandeDto } from './dtos/create-commande.dto';
import { UpdateStatusDto } from './dtos/update-status.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('commandes')
export class CommandesController {
  constructor(private readonly commandesService: CommandesService) {}

  /** POST /commandes — place a new order */
  @Post()
  create(@Body() dto: CreateCommandeDto) {
    return this.commandesService.create(dto);
  }

  /** GET /commandes — list all orders (admin/manager) */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  findAll() {
    return this.commandesService.findAll();
  }

  /** GET /commandes/user/:userId — list orders for a specific user */
  @Get('user/:userId')
  findByUser(@Param('userId', ParseIntPipe) userId: number) {
    return this.commandesService.findByUser(userId);
  }

  /** GET /commandes/:id */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.commandesService.findOne(id);
  }

  /** PATCH /commandes/:id/status — update order status */
  @Patch(':id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.commandesService.updateStatus(id, dto);
  }

  /** DELETE /commandes/:id */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.commandesService.remove(id);
  }
}
