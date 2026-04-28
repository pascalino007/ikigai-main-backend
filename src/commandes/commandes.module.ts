import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Commande } from './commande.entity';
import { CommandesController } from './commandes.controller';
import { CommandesService } from './commandes.service';

@Module({
  imports: [TypeOrmModule.forFeature([Commande])],
  controllers: [CommandesController],
  providers: [CommandesService],
})
export class CommandesModule {}
