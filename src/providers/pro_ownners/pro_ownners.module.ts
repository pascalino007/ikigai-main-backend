import { Module } from '@nestjs/common';
import { ProOwnnersController } from './pro_ownners.controller';
import { ProOwnnersService } from './pro_ownners.service';
import { ProOwnners } from './pro_ownners.entity';
import { Users } from '../users/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports:[TypeOrmModule.forFeature([ProOwnners, Users])],
  controllers: [ProOwnnersController],
  providers: [ProOwnnersService]
})
export class ProOwnnersModule {}
