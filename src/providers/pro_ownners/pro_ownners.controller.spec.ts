import { Test, TestingModule } from '@nestjs/testing';
import { ProOwnnersController } from './pro_ownners.controller';

describe('ProOwnnersController', () => {
  let controller: ProOwnnersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProOwnnersController],
    }).compile();

    controller = module.get<ProOwnnersController>(ProOwnnersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
