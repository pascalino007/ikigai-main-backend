import { Test, TestingModule } from '@nestjs/testing';
import { GeovilleController } from './geoville.controller';
import { GeovilleService } from './geoville.service';

describe('GeovilleController', () => {
  let controller: GeovilleController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GeovilleController],
      providers: [GeovilleService],
    }).compile();

    controller = module.get<GeovilleController>(GeovilleController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
