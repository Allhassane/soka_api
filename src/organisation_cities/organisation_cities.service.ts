import { UpdateOrganisationCityDto } from './dto/update-organisation-cities.dto';
import { CreateOrganisationCityDto } from './dto/create-organisation-cities.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganisationCities } from './entities/organisation_citie.entity';

@Injectable()
export class OrganisationCitiesService {

  constructor(
    @InjectRepository(OrganisationCities)
    private readonly organisationCitiesRepo: Repository<OrganisationCities>,
  ) { }

  findAll() {
    return this.organisationCitiesRepo.find();
  }

  create(createOrganisationCityDto: CreateOrganisationCityDto) {
    const organisationCity = this.organisationCitiesRepo.create(createOrganisationCityDto);
    return this.organisationCitiesRepo.save(organisationCity);
  }

  async findOne(uuid: string) {
    const organisation = await this.organisationCitiesRepo.findOneBy({ uuid });
    if (!organisation) throw new NotFoundException(`Organisation Citie #${uuid} not found`);
    return organisation;
  }

  async update(uuid: string, UpdateOrganisationCityDto: UpdateOrganisationCityDto) {
    const organisation = await this.findOne(uuid);
    Object.assign(organisation, UpdateOrganisationCityDto);
    return this.organisationCitiesRepo.save(organisation);
  }

  async remove(uuid: string) {
    const organisation = await this.findOne(uuid);
    if (!organisation) {
      throw new NotFoundException('Organisation city introuvable.');
    }
    return this.organisationCitiesRepo.remove(organisation);
  }

}
