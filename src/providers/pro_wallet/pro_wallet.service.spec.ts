import { Test, TestingModule } from '@nestjs/testing';
import { ProWalletService } from './pro_wallet.service';

describe('ProWalletService', () => {
  let service: ProWalletService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ProWalletService],
    }).compile();

    service = module.get<ProWalletService>(ProWalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
