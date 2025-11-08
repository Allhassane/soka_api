import { UpdateOrganisationCityDto } from './dto/update-organisation-cities.dto';
import { CreateOrganisationCityDto } from './dto/create-organisation-cities.dto';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { OrganisationCities } from './entities/organisation_citie.entity';

@Injectable()
export class OrganisationCitiesService {

  constructor(
    @InjectRepository(OrganisationCities)
    private readonly organisationCitiesRepo: Repository<OrganisationCities>,
  ) { }

  async findAll() {
    return this.organisationCitiesRepo.find(
      { where: { deletedAt: IsNull() } }
      //jk
    );
  }

  async create(createOrganisationCityDto: CreateOrganisationCityDto) {
    const organisationCity = this.organisationCitiesRepo.create(createOrganisationCityDto);
    const result = this.organisationCitiesRepo.save(organisationCity);
    if(!result) {
      return 'Une erreur est survenue lors de la création de la ville d\'organisation';
    }
    return 'Ville d\'organisation créée avec succès';
  }

  async findOne(uuid: string) {
    const organisation = await this.organisationCitiesRepo.findOneBy({ uuid });
    if (!organisation) throw new NotFoundException(`Organisation Citie #${uuid} not found`);
    return organisation;
  }

  async update(uuid: string, UpdateOrganisationCityDto: UpdateOrganisationCityDto) {
    const organisation = await this.findOne(uuid);
    Object.assign(organisation, UpdateOrganisationCityDto);
    const result = this.organisationCitiesRepo.save(organisation);
    if(!result) {
      return 'Une erreur est survenue lors de la mise à jour de la ville d\'organisation';
    }
    return 'Ville d\'organisation mise à jour avec succès';
  }

  async remove(uuid: string) {
    const organisation = await this.findOne(uuid);
    if (!organisation) {
      throw new NotFoundException('Ville d’organisation introuvable.');
    }

    //Soft delete
    await this.organisationCitiesRepo.softRemove(organisation);

    return { message: "Ville d'organisation supprimée avec succès (soft delete)" };
  }

}
