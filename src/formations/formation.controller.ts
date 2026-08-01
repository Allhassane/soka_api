import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FormationService } from './formation.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateFormationDto } from './dto/create-formation.dto';
import { UpdateFormationDto } from './dto/update-formation.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { ReferentialRead } from 'src/auth/decorators/referential-read.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import {
  ReferentialMergeService,
  REFERENTIAL_FORMATIONS,
} from 'src/shared/services/referential-merge.service';
import { MergeReferentialDto } from 'src/shared/dtos/merge-referential.dto';

@ApiBearerAuth()
@ApiTags('Formations')
@Controller('formations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FormationController {
  constructor(private readonly formationService: FormationService,
    private readonly referentialMergeService: ReferentialMergeService,
  ) {}

  @Get()
  @ReferentialRead()
  @ApiOperation({ summary: 'Liste toutes les formations ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.formationService.findAll(admin_uuid);
  }

  @Post()
  @RequirePermissions('formations_creer')
  @ApiOperation({ summary: 'Créer une civilité ' })
  @ApiResponse({ status: 200, description: 'Formation créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateFormationDto, @Request() req) {
    return this.formationService.store(payload, req.user.uuid as string);
  }

  /**
   * ⚠️ Déclarées AVANT `@Get(':uuid')` : sinon « merge » serait pris pour un uuid par la route
   * dynamique. Même piège que les routes `/quota` des paiements.
   */
  @Get('merge/usage/:uuid')
  @ReferentialRead()
  @ApiOperation({
    summary: "Nombre de porteurs d'un élément, avant reversement",
  })
  usageAvantFusion(@Param('uuid') uuid: string) {
    return this.referentialMergeService.usage(REFERENTIAL_FORMATIONS, uuid);
  }

  @Post('merge')
  @RequirePermissions('formations_modifier')
  @ApiOperation({
    summary: "Reverser tous les membres d'une formation vers une autre",
  })
  @ApiResponse({ status: 200, description: 'Reversement effectué.' })
  @ApiResponse({ status: 400, description: 'Éléments identiques ou invalides.' })
  merge(@Body() payload: MergeReferentialDto, @Request() req) {
    return this.referentialMergeService.merge(
      REFERENTIAL_FORMATIONS,
      payload.source_uuid,
      payload.target_uuid,
      payload.delete_source === true,
      req.user.uuid as string,
    );
  }

  @Get(':uuid')
  @ReferentialRead()
  @ApiOperation({ summary: 'Récupérer une civilité par UUID' })
  @ApiResponse({ status: 200, description: 'Formation trouvé.' })
  @ApiResponse({ status: 400, description: 'Formation non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.formationService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @RequirePermissions('formations_modifier')
 @ApiOperation({ summary: 'Modifier une civilité' })
 @ApiResponse({ status: 200, description: 'Formation modifiée avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateFormationDto,
    ) {
    return this.formationService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @RequirePermissions('formations_supprimer')
  @ApiOperation({ summary: 'Supprimer une civilité' })
  @ApiResponse({ status: 200, description: 'Formation supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Fotmation introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.formationService.delete(uuid,admin_uuid);
  }
}
