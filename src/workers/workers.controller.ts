import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  ParseIntPipe,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { WorkersService } from './workers.service';
import {
  CreateWorkerDto,
  UpdateWorkerDto,
  CreateExceptionDto,
} from './dto/create-worker.dto';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  create(@Body() dto: CreateWorkerDto) {
    return this.workersService.create(dto);
  }

  @Get()
  findAll() {
    return this.workersService.findAll();
  }

  @Get('shop/:shopId')
  findByShop(@Param('shopId', ParseIntPipe) shopId: number) {
    return this.workersService.findByShop(shopId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.workersService.findOne(id);
  }

  @Put(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWorkerDto) {
    return this.workersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.workersService.remove(id);
  }

  // ─── EXCEPTIONS ────────────────────────────────────────────────────────

  @Post('exceptions')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  addException(@Body() dto: CreateExceptionDto) {
    return this.workersService.addException(dto);
  }

  @Delete('exceptions/:id')
  removeException(@Param('id', ParseIntPipe) id: number) {
    return this.workersService.removeException(id);
  }

  // ─── AVAILABILITY ─────────────────────────────────────────────────────

  /**
   * GET /workers/:id/availability?date=2025-06-15&service_id=3
   * Returns time slots for a specific worker on a date.
   */
  @Get(':id/availability')
  getAvailability(
    @Param('id', ParseIntPipe) id: number,
    @Query('date') date: string,
    @Query('service_id', ParseIntPipe) serviceId: number,
  ) {
    return this.workersService.getAvailability(id, date, serviceId);
  }

  /**
   * GET /workers/shop/:shopId/availability?date=2025-06-15&service_id=3
   * Returns all workers with available slots for a shop on a date.
   */
  @Get('shop/:shopId/availability')
  getShopAvailability(
    @Param('shopId', ParseIntPipe) shopId: number,
    @Query('date') date: string,
    @Query('service_id', ParseIntPipe) serviceId: number,
  ) {
    return this.workersService.getShopAvailability(shopId, date, serviceId);
  }
}
