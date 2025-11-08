import { Module } from '@nestjs/common';
import { OrganisationCitiesController } from './organisation_cities.controller';
import { OrganisationCitiesService } from './organisation_cities.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrganisationCities } from './entities/organisation_citie.entity';

@Module({
  imports: [TypeOrmModule.forFeature([OrganisationCities])],
  controllers: [OrganisationCitiesController],
  providers: [OrganisationCitiesService]
})
export class OrganisationCitiesModule {}
