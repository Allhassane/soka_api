import { Test, TestingModule } from '@nestjs/testing';
import { OrganisationCitiesController } from './organisation_cities.controller';

describe('OrganisationCitiesController', () => {
  let controller: OrganisationCitiesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganisationCitiesController],
    }).compile();

    controller = module.get<OrganisationCitiesController>(OrganisationCitiesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
