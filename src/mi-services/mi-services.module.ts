import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MiServicesService } from './mi-services.service';
import { MiServicesController } from './mi-services.controller';
import { MiService } from './mi-service.entity';
import { MiServiceOrder } from './mi-service-order.entity';
import { Transaction } from '../transaction/transaction.entity';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MiService, MiServiceOrder, Transaction]),
    PaymentsModule,
  ],
  controllers: [MiServicesController],
  providers: [MiServicesService],
  exports: [MiServicesService],
})
export class MiServicesModule {}
