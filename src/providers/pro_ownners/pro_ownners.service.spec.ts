import { Test, TestingModule } from '@nestjs/testing';
import { ProOwnnersService } from './pro_ownners.service';

describe('ProOwnnersService', () => {
  let service: ProOwnnersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProOwnnersService],
    }).compile();

    service = module.get<ProOwnnersService>(ProOwnnersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
