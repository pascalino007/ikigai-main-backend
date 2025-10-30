import { Test, TestingModule } from '@nestjs/testing';
import { ProAbnService } from './pro_abn.service';

describe('ProAbnService', () => {
  let service: ProAbnService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProAbnService],
    }).compile();

    service = module.get<ProAbnService>(ProAbnService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
