import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { SubscriptionPaginationQueryDto } from './dto/subscription-pagination-query.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { EffectivePermissionsService } from 'src/access-scope/effective-permissions.service';
import { resoudreStatutCampagne } from 'src/shared/services/campaign-status-filter';

@ApiBearerAuth()
@ApiTags('Abonnement')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubscriptionController {
  constructor(
    private readonly effectivePermissions: EffectivePermissionsService,
    private readonly subscriptionService: SubscriptionService) {}

  @Get()
  @RequirePermissions('abonnements_voir')
  @ApiOperation({ summary: 'Liste toutes les abonnements ' })
  @ApiResponse({ status: 200, description: 'Retour paginé' })
  /**
   * ⚠️ Le statut est résolu **ici**, avant le service : par défaut seules les campagnes en cours
   * sont renvoyées, et demander un autre statut exige `abonnements_filtrer_par_statut`.
   * Masquer le sélecteur côté écran ne suffirait pas - `?status=archived` reste tapable.
   */
  async findAll(@Request() req, @Query() query: SubscriptionPaginationQueryDto) {
    const admin_uuid = req.user.uuid as string;
    const { page, limit, search, status } = query;

    const peutFiltrer =
      req.user?.is_admin === true ||
      (
        await this.effectivePermissions.slugsFor({
          uuid: req.user?.uuid,
          member_uuid: req.user?.member_uuid,
        })
      ).has('abonnements_filtrer_par_statut');

    const { statut } = resoudreStatutCampagne(status, peutFiltrer);

    return this.subscriptionService.findAll(admin_uuid, page, limit, search, statut);
  }

  @Post()
  @RequirePermissions('abonnements_creer')
  @ApiOperation({ summary: 'Créer un abonnement ' })
  @ApiResponse({ status: 200, description: 'Métier créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateSubscriptionDto, @Request() req) {
    return this.subscriptionService.store(payload, req.user.uuid as string);
  }

  @Get('open-to-subscribe')
  @RequirePermissions('abonnements_voir')
  @ApiOperation({
    summary:
      "Campagnes ouvertes que l'utilisateur n'a pas encore souscrites (action prioritaire)",
  })
  @ApiResponse({ status: 200, description: 'Campagnes ouvertes à souscrire.' })
  openToSubscribe(@Request() req) {
    return this.subscriptionService.getOpenToSubscribe(req.user.uuid as string);
  }

  @Get('findOneByUuid:uuid')
  @RequirePermissions('abonnements_voir')
  @ApiOperation({ summary: 'Récupérer une abonnement par UUID' })
  @ApiResponse({ status: 200, description: 'Abonnement trouvé.' })
  @ApiResponse({ status: 400, description: 'Abonnement non trouvé.' })
  findOneByUuid(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.subscriptionService.findOneByUuid(uuid, admin_uuid);
  }

  @Get(':uuid')
  @RequirePermissions('abonnements_voir')
  @ApiOperation({ summary: 'Récupérer une abonnement par UUID' })
  @ApiResponse({ status: 200, description: 'Abonnement trouvé.' })
  @ApiResponse({ status: 400, description: 'Abonnement non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.subscriptionService.findOne( uuid,
      req.user.uuid,
      req.user.member_uuid,
      req.user.responsibilities?.[0]?.structure?.uuid,);
  }

 @Put(':uuid')
 @RequirePermissions('abonnements_modifier')
 @ApiOperation({ summary: 'Modifier un abonnement' })
 @ApiResponse({ status: 200, description: 'Abonnement modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateSubscriptionDto,
    ) {
    return this.subscriptionService.update(uuid, payload,req.user.uuid);
 }


@Put(':uuid/status')
@RequirePermissions('abonnements_modifier')
@ApiOperation({ summary: 'Changer le statut d’un abonnement' })
@ApiParam({ name: 'uuid', description: 'UUID de l’abonnement à modifier' })
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
@ApiResponse({ status: 404, description: 'Abonnement introuvable ou administrateur invalide.' })
async changeStatus(
  @Param('uuid') uuid: string,
  @Body('status') status: GlobalStatus,
  @Request() req,
) {
  return this.subscriptionService.changeStatus(uuid, status, req.user.uuid);
}

  @Delete(':uuid')
  @RequirePermissions('abonnements_supprimer')
  @ApiOperation({ summary: 'Supprimer un abonnement' })
  @ApiResponse({ status: 200, description: 'Abonnement supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Abonnement introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.subscriptionService.delete(uuid,admin_uuid);
  }
}
