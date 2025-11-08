import { Test, TestingModule } from '@nestjs/testing';
import { OrganisationCitiesService } from './organisation_cities.service';

describe('OrganisationCitiesService', () => {
  let service: OrganisationCitiesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OrganisationCitiesService],
    }).compile();

    service = module.get<OrganisationCitiesService>(OrganisationCitiesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
