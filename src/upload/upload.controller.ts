import { Controller, Post, UseInterceptors, UploadedFiles, UploadedFile } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { UploadService } from './upload.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @UseInterceptors(FileInterceptor('image'))
  async uploadSingle(@UploadedFile() file: Express.Multer.File) {
    const imageUrl = await this.uploadService.uploadFile(file);
    return { imageUrl };
  }

  @Post('multiple')
  @UseInterceptors(FilesInterceptor('images', 10))
  async uploadMultiple(@UploadedFiles() files: Express.Multer.File[]) {
    const imageUrls = await this.uploadService.uploadFiles(files);
    return { imageUrls };
  }
}

