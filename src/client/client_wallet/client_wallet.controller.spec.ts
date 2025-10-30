import { Test, TestingModule } from '@nestjs/testing';
import { ClientWalletController } from './client_wallet.controller';

describe('ClientWalletController', () => {
  let controller: ClientWalletController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientWalletController],
    }).compile();

    controller = module.get<ClientWalletController>(ClientWalletController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
