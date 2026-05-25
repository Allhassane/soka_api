import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CountryService } from './country.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateCountryDto } from './dto/create-countries.dto';
import { UpdateCountryDto } from './dto/update-countries.dto';

@ApiBearerAuth()
@ApiTags('Pays')
@Controller('countries')
@UseGuards(JwtAuthGuard)
export class CountryController {
  constructor(private readonly countryService: CountryService) {}

  @Get()
  @ApiOperation({ summary: 'Liste toutes les métiers ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.countryService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un pays ' })
  @ApiResponse({ status: 200, description: 'Pays créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateCountryDto, @Request() req) {
    return this.countryService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une métier par UUID' })
  @ApiResponse({ status: 200, description: 'Métier trouvé.' })
  @ApiResponse({ status: 400, description: 'Metier non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.countryService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
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
  @ApiOperation({ summary: 'Supprimer un pays' })
  @ApiResponse({ status: 200, description: 'Pays supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Pays introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.countryService.delete(uuid,admin_uuid);
  }
}
