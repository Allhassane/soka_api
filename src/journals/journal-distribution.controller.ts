import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
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
import { AckDeliveryDto, DistributeEditionDto } from './dto/distribute-edition.dto';

@ApiBearerAuth()
@ApiTags('Journal - Distribution')
@Controller('journals')
@UseGuards(JwtAuthGuard)
export class JournalDistributionController {
  constructor(private readonly service: JournalDistributionService) {}

  @Post('editions/:uuid/distribute')
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
  @ApiOperation({
    summary: 'Tache de balayage : marque late et relance a J+1',
    description:
      'Marque late toutes les distributions encore non livrees dont la deadline est depassee, et relance via SMS/WhatsApp les distributions notifiees a J+1 (max 2 relances).',
  })
  @ApiResponse({ status: 200, description: 'Sweep effectue. Renvoie le compte de late et de relances.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  sweep(@Request() req) {
    return this.service.sweepLateAndRemind(req.user.uuid as string);
  }

  @Get('editions/:uuid/stats')
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
  @ApiOperation({
    summary: 'Statistiques globales du journal',
    description: 'Total editions, total distributions, livrees, late, taux livraison et taux retard.',
  })
  @ApiResponse({ status: 200, description: 'Statistiques globales.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  globalStats(@Request() req) {
    return this.service.globalStats(req.user.uuid as string);
  }
}
