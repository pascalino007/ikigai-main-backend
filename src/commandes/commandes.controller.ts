import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe } from '@nestjs/common';
import { CommandesService } from './commandes.service';
import { CreateCommandeDto } from './dtos/create-commande.dto';
import { UpdateStatusDto } from './dtos/update-status.dto';

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
  findAll() {
    return this.commandesService.findAll();
  }

  /** GET /commandes/:id */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.commandesService.findOne(id);
  }

  /** PATCH /commandes/:id/status — update order status */
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.commandesService.updateStatus(id, dto);
  }

  /** DELETE /commandes/:id */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.commandesService.remove(id);
  }
}
