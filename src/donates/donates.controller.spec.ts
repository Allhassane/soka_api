import { Test, TestingModule } from '@nestjs/testing';
import { DonatesController } from './donates.controller';

describe('DonatesController', () => {
  let controller: DonatesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DonatesController],
    }).compile();

    controller = module.get<DonatesController>(DonatesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
