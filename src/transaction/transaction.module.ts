import { Module } from '@nestjs/common';
import { TransactionController } from './transaction.controller';
import { TransactionService } from './transaction.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transactionm } from './transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transactionm])],
  controllers: [TransactionController],
  providers: [TransactionService]
})
export class TransactionModule {}
