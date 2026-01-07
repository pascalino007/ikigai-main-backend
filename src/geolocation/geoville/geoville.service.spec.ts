import { Test, TestingModule } from '@nestjs/testing';
import { GeovilleService } from './geoville.service';

describe('GeovilleService', () => {
  let service: GeovilleService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GeovilleService],
    }).compile();

    service = module.get<GeovilleService>(GeovilleService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
