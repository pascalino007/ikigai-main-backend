import { Module } from '@nestjs/common';
import { GeovilleService } from './geoville.service';
import { GeovilleController } from './geoville.controller';
import { Geoville } from './entities/geoville.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
   imports:[TypeOrmModule.forFeature([Geoville])],
    controllers: [GeovilleController],
    providers: [GeovilleService]
})
export class GeovilleModule {}
