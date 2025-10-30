import { Module } from '@nestjs/common';
import { ProOwnnersController } from './pro_ownners.controller';
import { ProOwnnersService } from './pro_ownners.service';
import { ProOwnners } from './pro_ownners.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports:[TypeOrmModule.forFeature([ProOwnners])],
  controllers: [ProOwnnersController],
  providers: [ProOwnnersService]
})
export class ProOwnnersModule {}
