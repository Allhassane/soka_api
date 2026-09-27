import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { CONTROLE } from './controle.helpers';
import { ControleService } from './controle.service';

/**
 * **Module Contrôle** : cohérence paiements collectés / abonnés / journaux. Lecture seule, sous
 * une permission UNIQUE (`controle_voir_menu_controle`) - un test verrouille qu'aucune route
 * d'écriture ni aucune autre permission n'apparaît ici.
 */
@ApiBearerAuth()
@ApiTags('Contrôle')
@Controller('controle')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ControleController {
  constructor(private readonly controle: ControleService) {}

  @Get('abonnements/campagnes')
  @RequirePermissions(CONTROLE)
  @ApiOperation({ summary: 'Campagnes d’abonnement proposées au contrôle (tous statuts)' })
  async campagnes() {
    return this.controle.campagnesAbonnement();
  }

  @Get('abonnements')
  @RequirePermissions(CONTROLE)
  @ApiOperation({
    summary: 'Contrôle d’une campagne d’abonnement : journaux, abonnés, régions, net',
  })
  async abonnement(@Query('campaign_uuid') campaign_uuid?: string) {
    return this.controle.abonnement(campaign_uuid);
  }
}
