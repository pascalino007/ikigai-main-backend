import { Test, TestingModule } from '@nestjs/testing';
import { EnrollersController } from './enrollers.controller';

describe('EnrollersController', () => {
  let controller: EnrollersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EnrollersController],
    }).compile();

    controller = module.get<EnrollersController>(EnrollersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
