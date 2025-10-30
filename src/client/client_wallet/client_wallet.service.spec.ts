import { Test, TestingModule } from '@nestjs/testing';
import { ClientWalletService } from './client_wallet.service';

describe('ClientWalletService', () => {
  let service: ClientWalletService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ClientWalletService],
    }).compile();

    service = module.get<ClientWalletService>(ClientWalletService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
