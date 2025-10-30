import { Test, TestingModule } from '@nestjs/testing';
import { ProWorkersService } from './pro_workers.service';

describe('ProWorkersService', () => {
  let service: ProWorkersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProWorkersService],
    }).compile();

    service = module.get<ProWorkersService>(ProWorkersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
