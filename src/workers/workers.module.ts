import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Worker } from './entities/worker.entity';
import { WorkerSchedule } from './entities/worker-schedule.entity';
import { WorkerException } from './entities/worker-exception.entity';
import { Bookings } from '../client/bookings/bookings.entity';
import { Services } from '../services/services.entity';
import { Shops } from '../shops/shop.entity';
import { Users } from '../users/user.entity';
import { ProOwnners } from '../providers/pro_ownners/pro_ownners.entity';
import { WorkersService } from './workers.service';
import { WorkersController } from './workers.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Worker,
      WorkerSchedule,
      WorkerException,
      Bookings,
      Services,
      Shops,
      Users,
      ProOwnners,
    ]),
  ],
  controllers: [WorkersController],
  providers: [WorkersService],
  exports: [WorkersService],
})
export class WorkersModule {}
