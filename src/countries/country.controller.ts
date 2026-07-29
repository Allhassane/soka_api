import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CountryService } from './country.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateCountryDto } from './dto/create-countries.dto';
import { UpdateCountryDto } from './dto/update-countries.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiBearerAuth()
@ApiTags('Pays')
@Controller('countries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CountryController {
  constructor(private readonly countryService: CountryService) {}

  @Get()
  @RequirePermissions('pays_voir')
  @ApiOperation({ summary: 'Liste toutes les métiers ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.countryService.findAll(admin_uuid);
  }

  @Post()
  @RequirePermissions('pays_creer')
  @ApiOperation({ summary: 'Créer un pays ' })
  @ApiResponse({ status: 200, description: 'Pays créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateCountryDto, @Request() req) {
    return this.countryService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @RequirePermissions('pays_voir')
  @ApiOperation({ summary: 'Récupérer une métier par UUID' })
  @ApiResponse({ status: 200, description: 'Métier trouvé.' })
  @ApiResponse({ status: 400, description: 'Metier non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.countryService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @RequirePermissions('pays_modifier')
 @ApiOperation({ summary: 'Modifier un pays' })
 @ApiResponse({ status: 200, description: 'Pays modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateCountryDto,
    ) {
    return this.countryService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @RequirePermissions('pays_supprimer')
  @ApiOperation({ summary: 'Supprimer un pays' })
  @ApiResponse({ status: 200, description: 'Pays supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Pays introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.countryService.delete(uuid,admin_uuid);
  }
}
