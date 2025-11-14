import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CityService } from './city.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';

@ApiBearerAuth()
@ApiTags('Cities')
@Controller('cities')
@UseGuards(JwtAuthGuard)
export class CityController {
  constructor(private readonly cityService: CityService) {}

  @Get()
  @ApiOperation({ summary: 'Liste de toutes les localités ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.cityService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un Localité ' })
  @ApiResponse({ status: 200, description: 'Localité créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateCityDto, @Request() req) {
    return this.cityService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une localité par UUID' })
  @ApiResponse({ status: 200, description: 'Localité trouvé.' })
  @ApiResponse({ status: 400, description: 'Localité non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.cityService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier une localité' })
 @ApiResponse({ status: 200, description: 'Localité modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateCityDto,
    ) {
    return this.cityService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une localité' })
  @ApiResponse({ status: 200, description: 'Localité supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Localité introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.cityService.delete(uuid,admin_uuid);
  }
}
