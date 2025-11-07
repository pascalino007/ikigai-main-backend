import { Module } from '@nestjs/common';
import { SpecialsController } from './specials.controller';
import { SpecialsService } from './specials.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Special } from './special.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Special])],
  controllers: [SpecialsController],
  providers: [SpecialsService]
})
export class SpecialsModule {}
