import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Product } from './product.entity';
import { MarketplaceService } from './marketplace.service';
import { MarketplaceController } from './marketplace.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Product])],
  controllers: [MarketplaceController],
  providers: [MarketplaceService],
  exports: [MarketplaceService],
})
export class MarketplaceModule {}
