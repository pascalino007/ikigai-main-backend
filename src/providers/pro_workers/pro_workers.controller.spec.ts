import { Test, TestingModule } from '@nestjs/testing';
import { ProWorkersController } from './pro_workers.controller';

describe('ProWorkersController', () => {
  let controller: ProWorkersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProWorkersController],
    }).compile();

    controller = module.get<ProWorkersController>(ProWorkersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
