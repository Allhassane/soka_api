import { PartialType } from '@nestjs/swagger';
import { CreateOrganisationCityDto } from './create-organisation-cities.dto';

export class UpdateOrganisationCityDto extends PartialType(CreateOrganisationCityDto) {}
