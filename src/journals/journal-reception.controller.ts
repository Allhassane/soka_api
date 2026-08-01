import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { JournalReceptionService } from './journal-reception.service';
import {
  ValidateDistrictLotDto,
  ValidateMemberReceptionDto,
} from './dto/reception.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiBearerAuth()
@ApiTags('Journal - Réception')
@Controller('journals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JournalReceptionController {
  constructor(private readonly service: JournalReceptionService) {}

  // ⚠️ OU logique. Ce bloc est celui du **tableau de bord**, pas de l'écran Journal : son droit
  // nommé est `dashboard_consulter_actions_prioritaires`, accordé aux 3 rôles et exigé par aucune
  // route (audit §H4). Résultat pour un MEMBRE : « Impossible de charger les actions » en
  // permanence, **et la requête relancée toutes les 60 s** — un 403 en boucle.
  // Élargir le droit n'élargit pas la donnée : le service ne renvoie que le périmètre de
  // l'appelant (`getPriorityActions(req.user.uuid)`), donc pour un membre sa propre réception.
  @Get('priority-actions')
  @RequirePermissions(
    'dashboard_consulter_actions_prioritaires',
    'journal_reception_voir',
  )
  @ApiOperation({
    summary: "Actions prioritaires de l'utilisateur connecté",
    description:
      "Agrège les éditions dont la distribution est démarrée, restreintes au périmètre de l'utilisateur : lots district à valider et membres en attente de réception.",
  })
  @ApiResponse({ status: 200, description: 'Actions prioritaires (périmètre).' })
  priorityActions(@Request() req) {
    return this.service.getPriorityActions(req.user.uuid as string);
  }

  @Get('editions/:uuid/reception')
  @RequirePermissions('journal_reception_voir')
  @ApiOperation({
    summary: 'Réception par district (cascade District → Membre)',
    description:
      "Regroupe les abonnés payés de l'édition par DISTRICT (déduit de leur structure) avec l'état de réception du lot et de chaque membre.",
  })
  @ApiParam({ name: 'uuid', description: "UUID de l'édition" })
  @ApiResponse({ status: 200, description: 'Vue de réception par district.' })
  @ApiResponse({ status: 400, description: 'Édition non liée à une campagne.' })
  @ApiResponse({ status: 404, description: 'Édition introuvable.' })
  reception(@Param('uuid') edition_uuid: string, @Request() req) {
    return this.service.receptionByDistrict(
      edition_uuid,
      req.user.uuid as string,
    );
  }

  @Get('editions/:uuid/reception-stats')
  @RequirePermissions('journal_reception_voir')
  @ApiOperation({
    summary: 'Statistiques de réception (suivi distribution)',
    description:
      'Synthèse globale (districts/membres reçus, en attente, en retard) + agrégat par district, sans la liste nominative.',
  })
  @ApiParam({ name: 'uuid', description: "UUID de l'édition" })
  @ApiResponse({ status: 200, description: 'Statistiques de réception.' })
  receptionStats(@Param('uuid') edition_uuid: string, @Request() req) {
    return this.service.receptionStats(edition_uuid, req.user.uuid as string);
  }

  @Get('editions/:uuid/reception-analytics')
  @RequirePermissions('journal_reception_voir')
  @ApiOperation({
    summary: 'Tableau de bord analytique du suivi de distribution aux membres',
    description:
      'Timeline cumulée des membres servis, rollup par région, classement/retards par district, suivi par responsable de district.',
  })
  @ApiParam({ name: 'uuid', description: "UUID de l'édition" })
  @ApiResponse({ status: 200, description: 'Analytique de réception.' })
  receptionAnalytics(@Param('uuid') edition_uuid: string, @Request() req) {
    return this.service.receptionAnalytics(
      edition_uuid,
      req.user.uuid as string,
    );
  }

  @Put('editions/:uuid/districts/:districtUuid/reception')
  @RequirePermissions('journal_reception_modifier')
  @ApiOperation({
    summary: "Valider la réception du lot d'un district",
    description:
      'Enregistre le réceptionnaire = responsable du district (auto, repli sur le validateur).',
  })
  @ApiParam({ name: 'uuid', description: "UUID de l'édition" })
  @ApiParam({ name: 'districtUuid', description: 'UUID de la structure district' })
  @ApiResponse({ status: 200, description: 'Réception du lot enregistrée.' })
  validateDistrict(
    @Param('uuid') edition_uuid: string,
    @Param('districtUuid') district_uuid: string,
    @Body() payload: ValidateDistrictLotDto,
    @Request() req,
  ) {
    return this.service.validateDistrictLot(
      edition_uuid,
      district_uuid,
      req.user.uuid as string,
      payload?.received ?? true,
      payload?.note,
    );
  }

  @Put('editions/:uuid/members/:memberUuid/reception')
  @RequirePermissions('journal_reception_modifier')
  @ApiOperation({
    summary: "Valider la réception individuelle d'un membre",
  })
  @ApiParam({ name: 'uuid', description: "UUID de l'édition" })
  @ApiParam({ name: 'memberUuid', description: 'UUID du membre' })
  @ApiResponse({ status: 200, description: 'Réception du membre enregistrée.' })
  validateMember(
    @Param('uuid') edition_uuid: string,
    @Param('memberUuid') member_uuid: string,
    @Body() payload: ValidateMemberReceptionDto,
    @Request() req,
  ) {
    return this.service.validateMemberReception(
      edition_uuid,
      member_uuid,
      req.user.uuid as string,
      payload?.received ?? true,
      payload?.district_uuid ?? null,
    );
  }
}
