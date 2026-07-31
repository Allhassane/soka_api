import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CityService } from './city.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateCityDto } from './dto/create-city.dto';
import { UpdateCityDto } from './dto/update-city.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import {
  ReferentialMergeService,
  REFERENTIAL_LOCALITES,
} from 'src/shared/services/referential-merge.service';
import { MergeReferentialDto } from 'src/shared/dtos/merge-referential.dto';

@ApiBearerAuth()
@ApiTags('Cities')
@Controller('cities')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CityController {
  constructor(private readonly cityService: CityService,
    private readonly referentialMergeService: ReferentialMergeService,
  ) {}

  @Get()
  @RequirePermissions('villes_voir')
  @ApiOperation({ summary: 'Liste de toutes les localités ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.cityService.findAll(admin_uuid);
  }

  @Post()
  @RequirePermissions('villes_creer')
  @ApiOperation({ summary: 'Créer un Localité ' })
  @ApiResponse({ status: 200, description: 'Localité créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateCityDto, @Request() req) {
    return this.cityService.store(payload, req.user.uuid as string);
  }

  /**
   * ⚠️ Déclarées AVANT `@Get(':uuid')` : sinon « merge » serait pris pour un uuid par la route
   * dynamique. Même piège que les routes `/quota` des paiements.
   */
  @Get('merge/usage/:uuid')
  @RequirePermissions('villes_voir')
  @ApiOperation({
    summary: "Nombre de porteurs d'un élément, avant reversement",
  })
  usageAvantFusion(@Param('uuid') uuid: string) {
    return this.referentialMergeService.usage(REFERENTIAL_LOCALITES, uuid);
  }

  @Post('merge')
  @RequirePermissions('villes_modifier')
  @ApiOperation({
    summary: "Reverser tous les membres d'une localité de résidence vers une autre",
  })
  @ApiResponse({ status: 200, description: 'Reversement effectué.' })
  @ApiResponse({ status: 400, description: 'Éléments identiques ou invalides.' })
  merge(@Body() payload: MergeReferentialDto, @Request() req) {
    return this.referentialMergeService.merge(
      REFERENTIAL_LOCALITES,
      payload.source_uuid,
      payload.target_uuid,
      payload.delete_source === true,
      req.user.uuid as string,
    );
  }

  @Get(':uuid')
  @RequirePermissions('villes_voir')
  @ApiOperation({ summary: 'Récupérer une localité par UUID' })
  @ApiResponse({ status: 200, description: 'Localité trouvé.' })
  @ApiResponse({ status: 400, description: 'Localité non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.cityService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @RequirePermissions('villes_modifier')
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
  @RequirePermissions('villes_supprimer')
  @ApiOperation({ summary: 'Supprimer une localité' })
  @ApiResponse({ status: 200, description: 'Localité supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Localité introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.cityService.delete(uuid,admin_uuid);
  }
}
