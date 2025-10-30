import { Test, TestingModule } from '@nestjs/testing';
import { SousCategoryService } from './sous-category.service';

describe('SousCategoryService', () => {
  let service: SousCategoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SousCategoryService],
    }).compile();

    service = module.get<SousCategoryService>(SousCategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
