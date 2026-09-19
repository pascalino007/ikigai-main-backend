import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseInterceptors,
  UploadedFiles,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { SongsService } from './songs.service';
import { CreateSongDto, UpdateSongDto } from './dto/create-song.dto';
import { UploadService } from '../../upload/upload.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../auth/roles.guard';
import { Roles } from '../../auth/roles.decorator';

@Controller('songs')
export class SongsController {
  constructor(
    private readonly songsService: SongsService,
    private readonly uploadService: UploadService,
  ) {}

  /** Public: active songs only (mobile app) */
  @Get()
  findActive() {
    return this.songsService.findActive();
  }

  /** Admin: all songs */
  @Get('all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'designer')
  findAll() {
    return this.songsService.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'designer')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.songsService.findOne(id);
  }

  /**
   * Upload a new song.
   * Expects multipart: `audio` (required) + optional `cover` image.
   * Body fields: title, artist, isActive, order
   */
  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'designer')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'audio', maxCount: 1 },
      { name: 'cover', maxCount: 1 },
    ]),
  )
  async create(
    @Body() dto: CreateSongDto,
    @UploadedFiles()
    files: { audio?: Express.Multer.File[]; cover?: Express.Multer.File[] },
  ) {
    const audioFile = files.audio?.[0];
    if (!audioFile) {
      throw new Error('Audio file is required');
    }

    const fileUrl = await this.uploadService.uploadFile(audioFile);
    let coverUrl: string | undefined;
    if (files.cover?.[0]) {
      coverUrl = await this.uploadService.uploadFile(files.cover[0]);
    }

    return this.songsService.create(dto, fileUrl, coverUrl);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'designer')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSongDto,
  ) {
    return this.songsService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'designer')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.songsService.remove(id);
  }
}
