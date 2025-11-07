import { Test, TestingModule } from '@nestjs/testing';
import { SpecialsService } from './specials.service';

describe('SpecialsService', () => {
  let service: SpecialsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpecialsService],
    }).compile();

    service = module.get<SpecialsService>(SpecialsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
