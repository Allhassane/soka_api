import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { JournalDistributionService } from './journal-distribution.service';
import {
  AckDeliveryDto,
  DistributeEditionDto,
  SweepDistributionsDto,
} from './dto/distribute-edition.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiBearerAuth()
@ApiTags('Journal - Distribution')
@Controller('journals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JournalDistributionController {
  constructor(private readonly service: JournalDistributionService) {}

  @Post('editions/:uuid/distribute')
  @RequirePermissions('journal_distribution_lancer')
  @ApiOperation({
    summary: 'Lancer la distribution d une edition',
    description:
      'Cree une ligne de distribution par destination (idempotent) et envoie l alerte SMS/WhatsApp au correspondant via TextO. Si destination_uuids vide, toutes les destinations actives sont utilisees.',
  })
  @ApiParam({ name: 'uuid', description: 'UUID de l edition' })
  @ApiBody({ type: DistributeEditionDto })
  @ApiResponse({ status: 200, description: 'Distribution lancee.' })
  @ApiResponse({ status: 400, description: 'Destination(s) invalide(s) ou aucune a servir.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Edition introuvable.' })
  distribute(
    @Param('uuid') edition_uuid: string,
    @Body() payload: DistributeEditionDto,
    @Request() req,
  ) {
    return this.service.distributeEdition(edition_uuid, payload, req.user.uuid as string);
  }

  @Get('editions/:uuid/distributions')
  @RequirePermissions('journal_distribution_voir')
  @ApiOperation({
    summary: 'Liste des distributions d une edition',
    description: 'Le statut "late" est recalcule a la volee si la deadline est depassee.',
  })
  @ApiParam({ name: 'uuid', description: 'UUID de l edition' })
  @ApiResponse({ status: 200, description: 'Liste recuperee.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Edition introuvable.' })
  listForEdition(@Param('uuid') edition_uuid: string, @Request() req) {
    return this.service.listForEdition(edition_uuid, req.user.uuid as string);
  }

  @Put('distributions/:uuid/ack')
  @RequirePermissions('journal_distribution_modifier')
  @ApiOperation({
    summary: 'Confirmer la livraison d une distribution',
    description: 'Passe en delivered ou late selon la deadline de l edition.',
  })
  @ApiParam({ name: 'uuid', description: 'UUID de la distribution' })
  @ApiBody({ type: AckDeliveryDto })
  @ApiResponse({ status: 200, description: 'Livraison confirmee.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Distribution introuvable.' })
  ack(
    @Param('uuid') uuid: string,
    @Body() payload: AckDeliveryDto,
    @Request() req,
  ) {
    return this.service.ackDelivery(uuid, payload, req.user.uuid as string);
  }

  @Post('distributions/sweep')
  @RequirePermissions('journal_distribution_lancer')
  @ApiOperation({
    summary: 'Tache de balayage : marque late et relance a J+1',
    description:
      'Marque late toutes les distributions encore non livrees dont la deadline est depassee, et relance via SMS/WhatsApp les distributions notifiees a J+1 (max 2 relances).',
  })
  @ApiResponse({ status: 200, description: 'Sweep effectue. Renvoie le compte de late et de relances.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiBody({ type: SweepDistributionsDto, required: false })
  sweep(@Body() payload: SweepDistributionsDto, @Request() req) {
    return this.service.sweepLateAndRemind(
      req.user.uuid as string,
      payload?.edition_uuid,
    );
  }

  @Get('editions/:uuid/stats')
  @RequirePermissions('journal_distribution_voir')
  @ApiOperation({
    summary: 'Statistiques de distribution d une edition',
    description: 'Total destinations, notifiees, livrees, en retard, taux livraison, agregat par zone.',
  })
  @ApiParam({ name: 'uuid', description: 'UUID de l edition' })
  @ApiResponse({ status: 200, description: 'Statistiques calculees.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Edition introuvable.' })
  stats(@Param('uuid') edition_uuid: string, @Request() req) {
    return this.service.statsForEdition(edition_uuid, req.user.uuid as string);
  }

  @Get('stats')
  @RequirePermissions('journal_distribution_voir')
  @ApiOperation({
    summary: 'Statistiques globales du journal',
    description: 'Total editions, total distributions, livrees, late, taux livraison et taux retard.',
  })
  @ApiResponse({ status: 200, description: 'Statistiques globales.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  globalStats(@Request() req) {
    return this.service.globalStats(req.user.uuid as string);
  }

  @Get('editions/:uuid/needs-by-zone')
  @RequirePermissions('journal_distribution_voir')
  @ApiOperation({
    summary: 'Besoin par zone calcule depuis les abonnements',
    description:
      "Somme des quantites payees de la campagne liee a l'edition, repartie par zone via la ville du membre (members.city_uuid appartenant aux villes de la zone).",
  })
  @ApiParam({ name: 'uuid', description: 'UUID de l edition' })
  @ApiResponse({ status: 200, description: 'Besoin par zone calcule.' })
  @ApiResponse({ status: 400, description: 'Edition non liee a une campagne.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Edition introuvable.' })
  needsByZone(@Param('uuid') edition_uuid: string, @Request() req) {
    return this.service.computeNeedsByZone(edition_uuid, req.user.uuid as string);
  }

  @Get('editions/:uuid/zones/:zoneUuid/subscribers')
  @RequirePermissions('journal_distribution_voir')
  @ApiOperation({
    summary: 'Abonnes nominatifs d une zone pour une edition',
    description:
      "Liste les abonnes (paiements payes de la campagne liee) dont la ville appartient a la zone : nom, matricule, telephone, ville, quantite. Permet de tracer le flow abonne -> ville -> zone.",
  })
  @ApiParam({ name: 'uuid', description: 'UUID de l edition' })
  @ApiParam({ name: 'zoneUuid', description: 'UUID de la zone' })
  @ApiResponse({ status: 200, description: 'Liste des abonnes de la zone.' })
  @ApiResponse({ status: 400, description: 'Edition non liee a une campagne.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Edition introuvable.' })
  zoneSubscribers(
    @Param('uuid') edition_uuid: string,
    @Param('zoneUuid') zone_uuid: string,
    @Request() req,
  ) {
    return this.service.subscribersByZone(
      edition_uuid,
      zone_uuid,
      req.user.uuid as string,
    );
  }

  @Get('editions/:uuid/printing-report')
  @RequirePermissions('journal_distribution_voir')
  @ApiOperation({
    summary: 'Rapport d impression d une edition (3 listings)',
    description:
      "Reproduit le fichier Excel PRINTING REPORT depuis le besoin-par-zone : liste d'impression, recap groupe par responsable (sous-totaux) et colisage (etiquettes x/y). Parametre package_size pour la taille de colis.",
  })
  @ApiParam({ name: 'uuid', description: 'UUID de l edition' })
  @ApiResponse({ status: 200, description: 'Rapport d impression calcule.' })
  @ApiResponse({ status: 400, description: 'Edition non liee a une campagne.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Edition introuvable.' })
  printingReport(
    @Param('uuid') edition_uuid: string,
    @Query('package_size') packageSize: string,
    @Request() req,
  ) {
    return this.service.printingReport(
      edition_uuid,
      req.user.uuid as string,
      packageSize ? Number(packageSize) : undefined,
    );
  }

  @Get('editions/:uuid/printing-export')
  @RequirePermissions('journal_distribution_voir')
  @ApiOperation({
    summary: 'Export Excel mis en forme du rapport d impression',
    description:
      'Genere un classeur .xlsx reproduisant le fichier PRINTING REPORT (RECAP-ABONNES, PRINTING LIST, PACKAGES) avec en-tetes fusionnes, colonne ZONES fusionnee, sous-totaux et total general.',
  })
  @ApiParam({ name: 'uuid', description: 'UUID de l edition' })
  @ApiResponse({ status: 200, description: 'Fichier Excel telecharge.' })
  async printingReportXlsx(
    @Param('uuid') edition_uuid: string,
    @Query('package_size') packageSize: string,
    @Res() res: Response,
    @Request() req,
  ) {
    const { buffer, filename } = await this.service.buildPrintingWorkbook(
      edition_uuid,
      req.user.uuid as string,
      packageSize ? Number(packageSize) : undefined,
    );
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  }

  // ⚠️ Cette route expose l'ANNUAIRE (nom, matricule, téléphone, WhatsApp) via une recherche dans
  // toute la table des membres. Elle ne sert qu'à choisir un correspondant dans les modales
  // d'ÉCRITURE Zones / Destinations : elle exige donc ces droits-là, plus jamais un droit de
  // lecture des distributions (audit §H10 - le slug qui la gardait ne disait rien de la donnée).
  @Get('members')
  @RequirePermissions(
    'journal_destinations_creer',
    'journal_destinations_modifier',
    'journal_zones_creer',
    'journal_zones_modifier',
  )
  @ApiOperation({
    summary: 'Recherche de membres pour le journal',
    description:
      'Recherche par nom, prenom, matricule ou telephone. Sert au responsable de zone et au correspondant de destination.',
  })
  @ApiResponse({ status: 200, description: 'Liste de membres (max 20).' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  searchMembers(@Query('q') q: string) {
    return this.service.searchMembers(q);
  }
}
