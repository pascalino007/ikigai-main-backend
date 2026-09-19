import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
  UsePipes,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { WorkersService } from './workers.service';
import {
  CreateWorkerDto,
  UpdateWorkerDto,
  CreateExceptionDto,
} from './dto/create-worker.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('workers')
export class WorkersController {
  constructor(private readonly workersService: WorkersService) {}

  // ─── CRUD ──────────────────────────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  create(@Body() dto: CreateWorkerDto, @Req() req: any) {
    return this.workersService.create(dto, req.user);
  }

  // No shop scoping — platform-wide listing, staff-only.
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  findAll() {
    return this.workersService.findAll();
  }

  // Public: customer booking flow (mobile app) reads this to pick a worker.
  @Get('shop/:shopId')
  findByShop(@Param('shopId', ParseIntPipe) shopId: number) {
    return this.workersService.findByShop(shopId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.workersService.findOne(id);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateWorkerDto, @Req() req: any) {
    return this.workersService.update(id, dto, req.user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.workersService.remove(id, req.user);
  }

  // ─── EXCEPTIONS ────────────────────────────────────────────────────────

  @Post('exceptions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  addException(@Body() dto: CreateExceptionDto, @Req() req: any) {
    return this.workersService.addException(dto, req.user);
  }

  @Delete('exceptions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  removeException(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.workersService.removeException(id, req.user);
  }

  // ─── BUSY PERIODS (manual "occupé") ─────────────────────────────────────

  @Post(':id/busy')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  addBusyPeriod(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { busy_date: string; start_time: string; end_time: string; reason?: string },
    @Req() req: any,
  ) {
    return this.workersService.addBusyPeriod(id, body, req.user);
  }

  @Get(':id/busy')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  getBusyPeriods(
    @Param('id', ParseIntPipe) id: number,
    @Query('date') date: string | undefined,
    @Req() req: any,
  ) {
    return this.workersService.getBusyPeriods(id, date, req.user);
  }

  @Delete('busy/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  removeBusyPeriod(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.workersService.removeBusyPeriod(id, req.user);
  }

  @Get(':id/bookings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('provider', 'admin', 'manager')
  getWorkerBookings(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.workersService.getWorkerBookings(id, req.user);
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
