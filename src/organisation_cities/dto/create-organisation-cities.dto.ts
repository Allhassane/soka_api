import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateOrganisationCityDto {
  @IsString()
  @IsNotEmpty()
  name: string;

}
