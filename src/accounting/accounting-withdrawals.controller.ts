import { Body, Controller, Delete, Get, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { AccountingService, SaisieRetrait } from './accounting.service';
import { COMPTABILITE } from './accounting.helpers';

/**
 * **Compte de retrait** : les sorties d'argent du compte de collecte HUB2, saisies à la main
 * (ni le guichet ni HUB2 ne les transmettent). Chaque retrait entre dans le décompte du solde.
 *
 * ⚠️ Même permission unique que le reste du module (décision produit du 2026-08-10). Saisir un
 * retrait ne déplace pas d'argent : il explique un mouvement déjà fait chez HUB2.
 */
@ApiBearerAuth()
@ApiTags('Comptabilité')
@Controller('accounting/withdrawals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingWithdrawalsController {
  constructor(private readonly accounting: AccountingService) {}

  @Get()
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Retraits actifs du compte de collecte HUB2, et leur total' })
  async list() {
    return this.accounting.listWithdrawals();
  }

  @Post()
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Enregistre un retrait : il entre dans le décompte du solde' })
  async create(@Request() req, @Body() body: SaisieRetrait) {
    return this.accounting.createWithdrawal(body ?? {}, req.user?.uuid);
  }

  @Delete(':uuid')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Annule une saisie erronée (suppression logique, auteur conservé)' })
  async cancel(@Request() req, @Param('uuid') uuid: string) {
    return this.accounting.cancelWithdrawal(uuid, req.user?.uuid);
  }
}
