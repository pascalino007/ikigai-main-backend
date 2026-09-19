import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe, Req, UseGuards } from '@nestjs/common';
import { EnrollersService, CreateEnrollerDto } from './enrollers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('enrollers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'manager')
export class EnrollersController {
  constructor(private readonly enrollersService: EnrollersService) {}

  /** GET /enrollers — list all enrollers */
  @Get()
  findAll() {
    return this.enrollersService.findAll();
  }

  /** GET /enrollers/:id — enroller detail with enrolled shops */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.enrollersService.findOne(id);
  }

  /** GET /enrollers/:id/shops — shops enrolled by this enroller */
  @Get(':id/shops')
  getShops(@Param('id', ParseIntPipe) id: number) {
    return this.enrollersService.getEnrollerShops(id);
  }

  /** POST /enrollers — creator identity comes from the authenticated session, never the body. */
  @Post()
  create(@Body() dto: CreateEnrollerDto & {}, @Req() req: any) {
    return this.enrollersService.create(dto, req.user.role, req.user.id);
  }

  /** PATCH /enrollers/:id/toggle-active */
  @Patch(':id/toggle-active')
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.enrollersService.toggleActive(id);
  }

  /**
   * PATCH /enrollers/:id — edit an enroller. Updater identity comes from the
   * authenticated session, never the body. admin edits any enroller; a
   * manager only the enrollers under them.
   */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<CreateEnrollerDto>,
    @Req() req: any,
  ) {
    return this.enrollersService.update(id, dto, req.user.role, req.user.id);
  }

  /** DELETE /enrollers/:id — same permission rule as update. */
  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Req() req: any) {
    return this.enrollersService.remove(id, req.user.role, req.user.id);
  }
}
