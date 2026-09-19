import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { GeovilleService } from './geoville.service';
import { CreateGeovilleDto } from './dto/create-geoville.dto';
import { UpdateGeovilleDto } from './dto/update-geoville.dto';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@Controller('geoville')
export class GeovilleController {
  constructor(private readonly geovilleService: GeovilleService) {}

  // CREATE a new quartier / zone
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'manager')
  create(@Body() createGeovilleDto: CreateGeovilleDto) {
    return this.geovilleService.create(createGeovilleDto);
  }

  // GET all quartiers
  @Get()
  findAll() {
    return this.geovilleService.findAll();
  }

@Get(':id')
findOne(@Param('id') id: string) {
  return this.geovilleService.findOne(id);
}

// UPDATE using POST instead of PATCH
@Post(':id/update')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'manager')
update(
  @Param('id') id: string,
  @Body() updateGeovilleDto: UpdateGeovilleDto,
) {
  return this.geovilleService.update(id, updateGeovilleDto);
}

// DELETE using POST instead of DELETE
@Post(':id/delete')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'manager')
remove(@Param('id') id: string) {
  return this.geovilleService.remove(id);
}
}
