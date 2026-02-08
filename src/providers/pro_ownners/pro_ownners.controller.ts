import { Controller, Get, Post, Body, Param, Delete, ParseIntPipe } from '@nestjs/common';
import { ProOwnnersService } from './pro_ownners.service';
import { CreateProOwnnerDto } from './dtos/create-proownner.dto';
import { ProOwnners } from './pro_ownners.entity';
import { UpdateProOwnnerDto } from './dtos/update-proownner.dto';


@Controller('proownners')
export class ProOwnnersController {
  constructor(private readonly service: ProOwnnersService) {}

  // ✅ Create ProOwner
  @Post()
  async create(@Body() createDto: CreateProOwnnerDto): Promise<ProOwnners> {
    return await this.service.create(createDto);
  }

  // ✅ Count ProOwners in DB (path with two segments so it never matches :id)
  @Get('stats/count')
  async count(): Promise<{ count: number }> {
    const count = await this.service.count();
    return { count };
  }

  // ✅ Get all ProOwners
  @Get()
  async findAll(): Promise<ProOwnners[]> {
    return await this.service.findAll();
  }

  // ✅ Get one ProOwner by ID
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<ProOwnners> {
    return await this.service.findOne(id);
  }

  // ✅ Update ProOwner
  @Post(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateProOwnnerDto,
  ): Promise<ProOwnners> {
    return await this.service.update(id, updateDto);
  }

  // ✅ Delete ProOwner
  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    return await this.service.remove(id);
  }
}

