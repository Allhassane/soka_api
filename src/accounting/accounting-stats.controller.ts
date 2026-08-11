import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { AccountingService } from './accounting.service';
import { COMPTABILITE, versDate } from './accounting.helpers';

/**
 * **Tableau de bord Comptabilité** : solde HUB2 constaté + KPI par campagne.
 *
 * 🚨 Toutes les routes sont en LECTURE : sur les paiements comme vers le guichet (uniquement
 * des GET). Aucune ne crédite, ne referme ni ne modifie quoi que ce soit.
 *
 * ⚠️ Même permission unique que la concordance : le module entier vit sous
 * `comptabilite_voir_menu_comptabilite` (décision produit du 2026-08-10).
 */
@ApiBearerAuth()
@ApiTags('Comptabilité')
@Controller('accounting')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingStatsController {
  constructor(private readonly accounting: AccountingService) {}

  @Get('balance')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({
    summary: 'Solde HUB2 constaté à l’instant T (relais du guichet, lecture seule)',
  })
  async balance() {
    return this.accounting.liveBalance();
  }

  @Get('stats/campaigns')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Campagnes d’un type (abonnements ou zaimu), tous statuts' })
  @ApiQuery({ name: 'type', required: true, enum: ['subscription', 'donation'] })
  async campaigns(@Query('type') type?: string) {
    return this.accounting.listStatsCampaigns(type ?? '');
  }

  @Get('stats/kpi')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Compteurs par statut + montant collecté, filtrables par campagne' })
  @ApiQuery({ name: 'type', required: true, enum: ['subscription', 'donation'] })
  @ApiQuery({ name: 'campaign_uuid', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async kpi(
    @Query('type') type?: string,
    @Query('campaign_uuid') campaign?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.campaignKpi({
      type: type ?? '',
      campaign_uuid: campaign?.trim() || undefined,
      from: versDate(from, 'from'),
      to: versDate(to, 'to'),
    });
  }

  @Get('stats/payments')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({
    summary: 'Lignes composant une carte KPI, paginées (le total rendu EST le chiffre de la carte)',
  })
  @ApiQuery({ name: 'type', required: true, enum: ['subscription', 'donation'] })
  @ApiQuery({ name: 'campaign_uuid', required: false })
  @ApiQuery({
    name: 'bucket',
    required: false,
    enum: ['all', 'paid', 'pending', 'failed', 'cancelled'],
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async payments(
    @Query('type') type?: string,
    @Query('campaign_uuid') campaign?: string,
    @Query('bucket') bucket?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accounting.campaignPayments({
      type: type ?? '',
      campaign_uuid: campaign?.trim() || undefined,
      bucket,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }
}
