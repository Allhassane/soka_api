import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { OrganisationCityService } from './organisation_city.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateOrganisationCityDto } from './dto/create-organisation_city.dto';
import { UpdateOrganisationCityDto } from './dto/update-organisation_city.dto';

@ApiBearerAuth()
@ApiTags('Organisation cities')
@Controller('organisation-city')
@UseGuards(JwtAuthGuard)
export class OrganisationCityController {
  constructor(private readonly organisationCityService: OrganisationCityService) {}

  @Get()
  @ApiOperation({ summary: 'Liste toutes les villes ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.organisationCityService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une ville ' })
  @ApiResponse({ status: 200, description: 'ville créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateOrganisationCityDto, @Request() req) {
    return this.organisationCityService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une ville par UUID' })
  @ApiResponse({ status: 200, description: 'ville trouvé.' })
  @ApiResponse({ status: 400, description: 'ville non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.organisationCityService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier une ville' })
 @ApiResponse({ status: 200, description: 'Ville modifiée avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateOrganisationCityDto,
    ) {
    return this.organisationCityService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une ville' })
  @ApiResponse({ status: 200, description: 'ville supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'ville introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.organisationCityService.delete(uuid,admin_uuid);
  }
}
