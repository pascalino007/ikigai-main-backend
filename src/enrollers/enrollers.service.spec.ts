import { Test, TestingModule } from '@nestjs/testing';
import { EnrollersService } from './enrollers.service';

describe('EnrollersService', () => {
  let service: EnrollersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [EnrollersService],
    }).compile();

    service = module.get<EnrollersService>(EnrollersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
