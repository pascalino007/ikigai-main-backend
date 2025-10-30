import { Module } from '@nestjs/common';
import { EnrollersController } from './enrollers.controller';
import { EnrollersService } from './enrollers.service';

@Module({
  controllers: [EnrollersController],
  providers: [EnrollersService]
})
export class EnrollersModule {}
