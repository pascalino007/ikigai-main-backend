import { Test, TestingModule } from '@nestjs/testing';
import { ProAbnController } from './pro_abn.controller';

describe('ProAbnController', () => {
  let controller: ProAbnController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProAbnController],
    }).compile();

    controller = module.get<ProAbnController>(ProAbnController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
