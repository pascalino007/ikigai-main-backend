import { Module } from '@nestjs/common';
import { ProWorkersController } from './pro_workers.controller';
import { ProWorkersService } from './pro_workers.service';

@Module({
  controllers: [ProWorkersController],
  providers: [ProWorkersService]
})
export class ProWorkersModule {}
