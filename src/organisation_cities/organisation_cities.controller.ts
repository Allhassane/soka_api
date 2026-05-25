import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { OrganisationCitiesService } from './organisation_cities.service';
import { CreateOrganisationCityDto } from './dto/create-organisation-cities.dto';
import { UpdateOrganisationCityDto } from './dto/update-organisation-cities.dto';

@Controller('organisation-cities')
export class OrganisationCitiesController {

  constructor(
    private readonly organisationCitiesService: OrganisationCitiesService,
  ) { }

  @Get()
  findAll() {
    return this.organisationCitiesService.findAll();
  }

  @Post()
  create(@Body() createOrganisationCityDto: CreateOrganisationCityDto) {
    return this.organisationCitiesService.create(createOrganisationCityDto);
  }

  @Get(':uuid')
  findOne(@Param('uuid') uuid: string) {
    return this.organisationCitiesService.findOne(uuid);
  }

  @Patch(':uuid')
  update(
    @Param('uuid') uuid: string,
    @Body() updateOrganisationCityDto: UpdateOrganisationCityDto,
  ) {
    return this.organisationCitiesService.update(uuid, updateOrganisationCityDto);
  }

  @Delete(':uuid')
  remove(@Param('uuid') uuid: string) {
    return this.organisationCitiesService.remove(uuid);
  }

}
