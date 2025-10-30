import { Test, TestingModule } from '@nestjs/testing';
import { ProWalletController } from './pro_wallet.controller';

describe('ProWalletController', () => {
  let controller: ProWalletController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProWalletController],
    }).compile();

    controller = module.get<ProWalletController>(ProWalletController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
