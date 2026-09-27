import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { AccountingService } from './accounting.service';
import { COMPTABILITE } from './accounting.helpers';

/**
 * **Compte de retrait** : les sorties d'argent du compte de collecte HUB2, **lues chez HUB2**
 * (approvisionnements collecte → transfert, relayés par le guichet). Leur total entre dans le
 * décompte du solde.
 *
 * 🚨 **Lecture seule** : aucun retrait ne se crée ni ne s'annule dans l'application (décision
 * du 2026-09-27) - la saisie manuelle du 26/09 a été retirée. Un test verrouille qu'aucune route
 * d'écriture ne réapparaît ici.
 * ⚠️ Même permission unique que le reste du module (décision produit du 2026-08-10).
 */
@ApiBearerAuth()
@ApiTags('Comptabilité')
@Controller('accounting/withdrawals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingWithdrawalsController {
  constructor(private readonly accounting: AccountingService) {}

  @Get()
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Retraits du compte de collecte, lus chez HUB2, et leur total' })
  async list() {
    return this.accounting.listWithdrawals();
  }
}
