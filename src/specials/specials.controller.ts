import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { SpecialsService } from './specials.service';
import { CreateSpecialDto } from './dtos/create-special.dto';
import { UpdateSpecialDto } from './dtos/update-special.dto';


@Controller('specials')
export class SpecialsController {
  constructor(private readonly specialsService: SpecialsService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  create(@Body() createSpecialDto: CreateSpecialDto) {
    return this.specialsService.create(createSpecialDto);
  }

  @Get()
  findAll() {
    return this.specialsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.specialsService.findOne(id);
  }

  @Patch(':id')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  update(@Param('id') id: string, @Body() updateDto: UpdateSpecialDto) {
    return this.specialsService.update(id, updateDto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.specialsService.remove(id);
  }

  @Post(':id/use')
  @HttpCode(HttpStatus.OK)
  markUse(@Param('id') id: string) {
    return this.specialsService.markUse(id);
  }
}

