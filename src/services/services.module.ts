import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Services } from './services.entity';

@Module({
  imports:[TypeOrmModule.forFeature([Services])],
  controllers: [ServicesController],
  providers: [ServicesService]
})
export class ServicesModule {}
