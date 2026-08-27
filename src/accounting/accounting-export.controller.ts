import { Controller, Get, Param, Query, Request, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { AccountingExportService } from './accounting-export.service';
import { COMPTABILITE } from './accounting.helpers';

/**
 * **Export Excel des lignes d'une carte KPI - réservé au module Comptabilité.**
 *
 * Contrôleur séparé de `AccountingStatsController` **exprès** : celui-là est intégralement en
 * lecture, alors que lancer un export crée une ligne `export_jobs`. Mélanger les deux ferait
 * mentir la garantie affichée en tête du contrôleur de statistiques.
 *
 * ⚠️ **Même permission unique que le reste du module** (`comptabilite_voir_menu_comptabilite`) :
 * le module Comptabilité vit sous un droit et un seul (décision produit du 2026-08-10). Ces
 * routes n'exposent rien que l'écran ne montre déjà - elles le mettent dans un fichier.
 *
 * 🚨 **Ces exports n'apparaissent JAMAIS dans le module Exports** : sa liste les exclut et sa
 * route de téléchargement les refuse. Le cloisonnement est symétrique, cf.
 * `accounting-export.service.ts`.
 */
@ApiBearerAuth()
@ApiTags('Comptabilité')
@Controller('accounting/exports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingExportController {
  constructor(private readonly exports: AccountingExportService) {}

  @Get('payments')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({
    summary: 'Lancer en arrière-plan l’export des lignes d’une carte KPI',
    description:
      'Rend un `jobId` : le fichier n’existe pas encore. Interroger `status/:jobId` puis ' +
      'télécharger via `download/:jobId`.',
  })
  @ApiQuery({ name: 'type', required: true, enum: ['subscription', 'donation'] })
  @ApiQuery({ name: 'campaign_uuid', required: false })
  @ApiQuery({
    name: 'bucket',
    required: false,
    enum: ['all', 'paid', 'pending', 'failed', 'cancelled'],
  })
  async lancer(
    @Request() req,
    @Query('type') type?: string,
    @Query('campaign_uuid') campaign?: string,
    @Query('bucket') bucket?: string,
  ) {
    return this.exports.lancer(
      { type: type ?? '', campaign_uuid: campaign, bucket },
      req.user.uuid,
    );
  }

  @Get('status/:jobId')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Avancement d’un export comptable' })
  @ApiParam({ name: 'jobId', description: 'UUID du job rendu par `payments`' })
  async statut(@Param('jobId') jobId: string, @Request() req) {
    return this.exports.statut(jobId, req.user.uuid);
  }

  @Get('download/:jobId')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Télécharger le fichier d’un export comptable terminé' })
  @ApiParam({ name: 'jobId', description: 'UUID du job rendu par `payments`' })
  async telecharger(
    @Param('jobId') jobId: string,
    @Request() req,
    @Res() res: Response,
  ) {
    const { buffer, filename, mimeType } = await this.exports.telecharger(
      jobId,
      req.user.uuid,
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // Sans cet en-tête, le navigateur ne voit pas le nom du fichier depuis une requête XHR.
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.send(buffer);
  }
}
