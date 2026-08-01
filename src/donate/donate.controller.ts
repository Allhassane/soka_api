import { Body, Controller, Delete, Get, Param, Post, Put, Query, Request } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { DonateService } from './donate.service';
import { CreateDonateDto } from './dto/create-donate.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { UpdateDonateDto } from './dto/update-donate.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { EffectivePermissionsService } from 'src/access-scope/effective-permissions.service';
import { resoudreStatutCampagne } from 'src/shared/services/campaign-status-filter';
import { DonatePaginationQueryDto } from './dto/donate-pagination-query.dto';

@ApiTags('Don')
@Controller('donate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DonateController {
  constructor(
    private readonly effectivePermissions: EffectivePermissionsService,
    private readonly donateService: DonateService) {}

  @Get()
  @RequirePermissions('dons_voir')
  @ApiOperation({ summary: 'Liste de toutes les dons' })
  @ApiResponse({ status: 200, description: 'Retour paginé' })
  @ApiResponse({ status: 400, description: 'Liste non récupérée.' })
  /**
   * ⚠️ Le statut est résolu **ici**, avant le service : par défaut seules les campagnes en cours
   * sont renvoyées, et demander un autre statut exige `dons_filtrer_par_statut`.
   * Masquer le sélecteur côté écran ne suffirait pas - `?status=archived` reste tapable.
   */
  async findAll(@Request() req, @Query() query: DonatePaginationQueryDto) {
    const admin_uuid = req.user.uuid as string;
    const { page, limit, search, status } = query;

    const peutFiltrer =
      req.user?.is_admin === true ||
      (
        await this.effectivePermissions.slugsFor({
          uuid: req.user?.uuid,
          member_uuid: req.user?.member_uuid,
        })
      ).has('dons_filtrer_par_statut');

    const { statut } = resoudreStatutCampagne(status, peutFiltrer);

    return this.donateService.findAll(admin_uuid, page, limit, search, statut);
  }

  @Get('open-to-donate')
  @RequirePermissions('dons_voir')
  @ApiOperation({
    summary:
      "Campagnes de dons ouvertes auxquelles l'utilisateur n'a pas encore contribué (action prioritaire)",
  })
  @ApiResponse({ status: 200, description: 'Campagnes de dons à contribuer.' })
  openToDonate(@Request() req) {
    return this.donateService.getOpenToDonate(req.user.uuid as string);
  }

  @Get('findOneByUuid:uuid')
  @RequirePermissions('dons_voir')
  @ApiOperation({ summary: 'Récupérer une don par UUID' })
  @ApiResponse({ status: 200, description: 'Don trouvé.' })
  @ApiResponse({ status: 400, description: 'Don non trouvé.' })
  findOneByUuid(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.donateService.findOneByUuid(uuid, admin_uuid);
  }


  @Get(':uuid')
  @RequirePermissions('dons_voir')
  @ApiOperation({ summary: 'Récupérer une don par UUID' })
  @ApiResponse({ status: 200, description: 'Don trouvé.' })
  @ApiResponse({ status: 400, description: 'Don non trouvé.' })
  /**
   * ⚠️ Le bloc `statistics` (montant récolté, paiements réussis) n'est calculé que pour un
   * porteur du droit `zaimu_consulter_statistiques_campagne` - miroir exact des abonnements.
   */
  async findOne(@Param('uuid') uuid: string, @Request() req) {
    const peutVoirStats =
      req.user?.is_admin === true ||
      (
        await this.effectivePermissions.slugsFor({
          uuid: req.user?.uuid,
          member_uuid: req.user?.member_uuid,
        })
      ).has('zaimu_consulter_statistiques_campagne');

    return this.donateService.findOne(
      uuid,
      req.user.uuid,
      req.user.member_uuid,
      peutVoirStats ? req.user.responsibilities?.[0]?.structure?.uuid : undefined,
    );
  }


   @Put(':uuid')
   @RequirePermissions('dons_modifier')
   @ApiOperation({ summary: 'Modifier un don' })
   @ApiResponse({ status: 200, description: 'Don modifié avec succès.' })
   @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
   update(
   @Param('uuid') uuid: string,
   @Request() req,
   @Body() payload: UpdateDonateDto,
      ) {
      return this.donateService.update(uuid, payload,req.user.uuid);
   }


  @Post()
  @RequirePermissions('dons_creer')
  @ApiOperation({ summary: 'Ajouter un don' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  @ApiResponse({ status: 400, description: 'Liste non récupérée.' })
  create(@Body() createDonateDto: CreateDonateDto, @Request() req) {
    console.log(createDonateDto);
    const admin_uuid = req.user.uuid as string;
    return this.donateService.create(createDonateDto, admin_uuid);
  }

  @Put(':uuid/status')
  @RequirePermissions('dons_modifier')
  @ApiOperation({ summary: 'Changer le statut d’un don' })
  @ApiParam({ name: 'uuid', description: 'UUID du don à modifier' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: Object.values(GlobalStatus),
          example: 'STARTED',
        },
      },
      required: ['status'],
    },
  })
  @ApiResponse({ status: 200, description: 'Statut modifié avec succès.' })
  @ApiResponse({ status: 400, description: 'Statut invalide ou non autorisé.' })
  @ApiResponse({ status: 404, description: 'Don introuvable ou administrateur invalide.' })
  async changeStatus(
    @Param('uuid') uuid: string,
    @Body('status') status: GlobalStatus,
    @Request() req,
  ) {
    return this.donateService.changeStatus(uuid, status, req.user.uuid);
  }

  @Delete(':uuid')
  @RequirePermissions('dons_supprimer')
  @ApiOperation({ summary: 'Supprimer un don' })
  @ApiResponse({ status: 200, description: 'Don supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Don introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.donateService.delete(uuid,admin_uuid);
  }
}
