import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { AccountingService, ConcordanceFiltres } from './accounting.service';
import { COMPTABILITE, versDate } from './accounting.helpers';
import { MatchStatus } from './entities/acc-hub-snapshot-line.entity';

/** Taille maximale d'un export accepté. Au-delà, ce n'est pas un export HUB2. */
const TAILLE_MAX_EXPORT = 15 * 1024 * 1024;

/**
 * **Concordance « Solde HUB2 = Solde App ».**
 *
 * 🚨 Toutes les routes sont en LECTURE sur les paiements. Aucune ne crédite, ne referme ni ne
 * modifie un statut : le seul geste d'écriture ouvert ici est la **note de résolution** posée
 * sur une ligne d'instantané, qui explique un écart sans y toucher.
 *
 * ⚠️ Une seule permission pour tout le module (décision produit) : le module ne comportant aucun
 * geste dangereux, découper aurait produit des rôles capables de constater un écart sans pouvoir
 * le rafraîchir.
 */
@ApiBearerAuth()
@ApiTags('Comptabilité')
@Controller('accounting/concordance')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  private filtres(from?: string, to?: string, campaign_uuid?: string): ConcordanceFiltres {
    return {
      from: versDate(from, 'from'),
      to: versDate(to, 'to'),
      campaign_uuid: campaign_uuid?.trim() || undefined,
    };
  }

  @Get('overview')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({
    summary: 'État de la concordance : égalité brut/net, décompte du solde, décomposition',
  })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'campaign_uuid', required: false })
  async overview(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('campaign_uuid') campaign?: string,
  ) {
    return this.accounting.overview(this.filtres(from, to, campaign));
  }

  @Post('refresh')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({
    summary: 'Recalcule un instantané depuis la liste marchande du guichet (lecture seule)',
  })
  async refresh(
    @Request() req,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('campaign_uuid') campaign?: string,
  ) {
    return this.accounting.refreshFromGateway(
      this.filtres(from, to, campaign),
      req.user?.uuid,
    );
  }

  @Post('imports')
  @RequirePermissions(COMPTABILITE)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Importe un export HUB2 (CSV ou XLSX) - la preuve qui fait foi' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: TAILLE_MAX_EXPORT } }))
  async importer(
    @Request() req,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('campaign_uuid') campaign?: string,
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        message: 'Aucun fichier reçu. Joindre l’export HUB2 sous le champ « file ».',
        data: { code: 'FICHIER_MANQUANT' },
      });
    }
    return this.accounting.importExport(
      file,
      this.filtres(from, to, campaign),
      req.user?.uuid,
    );
  }

  @Get('snapshots')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Historique des instantanés de concordance' })
  async snapshots(@Query('limit') limit?: string) {
    return this.accounting.listSnapshots(limit ? Number(limit) : 20);
  }

  @Get('snapshots/:uuid/lines')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Détail d’un instantané, filtrable par catégorie d’écart' })
  @ApiQuery({ name: 'match_status', required: false, enum: MatchStatus })
  async lines(
    @Param('uuid') uuid: string,
    @Query('match_status') matchStatus?: MatchStatus,
    @Query('limit') limit?: string,
  ) {
    if (matchStatus && !Object.values(MatchStatus).includes(matchStatus)) {
      throw new BadRequestException({
        message: 'Catégorie d’écart inconnue.',
        data: { code: 'MATCH_STATUS_INVALIDE' },
      });
    }
    return this.accounting.listLines(uuid, matchStatus, limit ? Number(limit) : 200);
  }

  @Put('lines/:uuid/resolve')
  @RequirePermissions(COMPTABILITE)
  @ApiOperation({ summary: 'Explique un écart par une note (ne modifie aucun paiement)' })
  async resolve(
    @Request() req,
    @Param('uuid') uuid: string,
    @Body() body: { note?: string },
  ) {
    const note = body?.note?.trim();
    if (!note) {
      throw new BadRequestException({
        message: 'Une note est requise pour résoudre un écart.',
        data: { code: 'NOTE_REQUISE' },
      });
    }
    return this.accounting.resolveLine(uuid, note, req.user?.uuid);
  }
}
