import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Slider } from './sliders.entity';
import { SlidersController } from './sliders.controller';
import { SlidersService } from './sliders.service';
import { UploadModule } from '../../upload/upload.module';

@Module({
  imports: [TypeOrmModule.forFeature([Slider]), UploadModule],
  controllers: [SlidersController],
  providers: [SlidersService],
  exports: [SlidersService],
})
export class SlidersModule {}
