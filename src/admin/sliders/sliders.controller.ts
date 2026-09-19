import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  ParseIntPipe,
  UsePipes,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SlidersService } from './sliders.service';
import { CreateSliderDto, UpdateSliderDto } from './dto/create-slider.dto';
import { UploadService } from '../../upload/upload.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@Controller('sliders')
export class SlidersController {
  constructor(
    private readonly slidersService: SlidersService,
    private readonly uploadService: UploadService,
  ) {}

  /** Public: current active sliders (mobile promo cards) */
  @Get('current')
  findCurrent() {
    return this.slidersService.findCurrent();
  }

  /** Admin: all sliders */
  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'designer')
  findAll() {
    return this.slidersService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'designer')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.slidersService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'designer')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseInterceptors(FileInterceptor('image'))
  async create(
    @Body() dto: CreateSliderDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl: string | undefined;
    if (file) {
      imageUrl = await this.uploadService.uploadFile(file);
    }
    return this.slidersService.create(dto, imageUrl);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'designer')
  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @UseInterceptors(FileInterceptor('image'))
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSliderDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    let imageUrl: string | undefined;
    if (file) {
      imageUrl = await this.uploadService.uploadFile(file);
    }
    return this.slidersService.update(id, dto, imageUrl);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'designer')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.slidersService.remove(id);
  }
}
