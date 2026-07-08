import { Controller, Get, Post, Patch, Delete, Param, Body, ParseIntPipe } from '@nestjs/common';
import { EnrollersService, CreateEnrollerDto } from './enrollers.service';

@Controller('enrollers')
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

  /**
   * POST /enrollers
   * Body: { ...CreateEnrollerDto, creatorRole: string, creatorId: number }
   */
  @Post()
  create(
    @Body() body: CreateEnrollerDto & { creatorRole: string; creatorId: number },
  ) {
    const { creatorRole, creatorId, ...dto } = body;
    return this.enrollersService.create(dto, creatorRole, creatorId);
  }

  /** PATCH /enrollers/:id/toggle-active */
  @Patch(':id/toggle-active')
  toggleActive(@Param('id', ParseIntPipe) id: number) {
    return this.enrollersService.toggleActive(id);
  }

  /**
   * PATCH /enrollers/:id — edit an enroller.
   * Body: { ...fields, updaterRole: string, updaterId: number }
   * admin edits any enroller; a manager only the enrollers under them.
   */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Partial<CreateEnrollerDto> & { updaterRole: string; updaterId: number },
  ) {
    const { updaterRole, updaterId, ...dto } = body;
    return this.enrollersService.update(id, dto, updaterRole, Number(updaterId));
  }

  /**
   * DELETE /enrollers/:id — same permission rule as update.
   * Body: { updaterRole: string, updaterId: number }
   */
  @Delete(':id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { updaterRole: string; updaterId: number },
  ) {
    return this.enrollersService.remove(id, body?.updaterRole, Number(body?.updaterId));
  }
}
