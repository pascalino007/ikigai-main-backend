import { Module } from '@nestjs/common';
import { ProAbnController } from './pro_abn.controller';
import { ProAbnService } from './pro_abn.service';

@Module({
  controllers: [ProAbnController],
  providers: [ProAbnService]
})
export class ProAbnModule {}
