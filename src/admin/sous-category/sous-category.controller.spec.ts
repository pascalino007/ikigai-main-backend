import { Test, TestingModule } from '@nestjs/testing';
import { SousCategoriesController } from './sous-category.controller';

describe('SousCategoryController', () => {
  let controller: SousCategoriesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SousCategoriesController],
    }).compile();

    controller = module.get<SousCategoriesController>(SousCategoriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
