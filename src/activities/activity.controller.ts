import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { ActivityService } from './activity.service';
import { ActivityParticipantService } from './activity-participant.service';
import { ActivityAttendanceService } from './activity-attendance.service';
import { ActivityStatsService } from './activity-stats.service';
import { ActivityTargetService } from './activity-target.service';
import { ActivityQuotaService } from './activity-quota.service';
import { ActivityCommitteeService } from './activity-committee.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { AssignParticipantsDto } from './dto/assign-participants.dto';
import { ResolveTargetsDto } from './dto/resolve-targets.dto';
import { FilterActivitiesDto } from './dto/filter-activities.dto';
import { BulkMarkAttendanceDto, MarkAttendanceDto } from './dto/mark-attendance.dto';
import { CreateActivityQuotaDto, UpdateActivityQuotaDto } from './dto/create-activity-quota.dto';
import { CreateActivityCommitteeDto, UpdateActivityCommitteeDto } from './dto/create-activity-committee.dto';
import { CreateActivityCommitteeMemberDto, UpdateActivityCommitteeMemberDto } from './dto/create-activity-committee-member.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { ActivityParticipantRole } from './entities/activity-participant.entity';

@ApiBearerAuth()
@ApiTags('Activites')
@Controller('activities')
@UseGuards(JwtAuthGuard)
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly participantService: ActivityParticipantService,
    private readonly attendanceService: ActivityAttendanceService,
    private readonly statsService: ActivityStatsService,
    private readonly targetService: ActivityTargetService,
    private readonly quotaService: ActivityQuotaService,
    private readonly committeeService: ActivityCommitteeService,
  ) {}

  // ============================================================
  // CRUD ACTIVITE
  // ============================================================

  @Get()
  @ApiOperation({
    summary: 'Liste filtrable et paginee des activites',
    description:
      'Filtres combinables : search, type, status, structure_uuid, structures[], level_uuid, member_uuid, from, to, upcoming, past. Tri : order_by, order_dir. Pagination : limit, offset.',
  })
  @ApiResponse({ status: 200, description: 'Liste recuperee avec succes.' })
  @ApiResponse({ status: 401, description: 'Non autorise - Authentification requise.' })
  findAll(@Request() req, @Query() filter: FilterActivitiesDto) {
    return this.activityService.findAll(req.user.uuid as string, filter);
  }

  @Post()
  @ApiOperation({
    summary: 'Creer une activite avec organigramme et criteres de ciblage',
  })
  @ApiBody({ type: CreateActivityDto })
  @ApiResponse({ status: 201, description: 'Activite creee avec succes.' })
  @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Auteur introuvable.' })
  store(@Body() payload: CreateActivityDto, @Request() req) {
    return this.activityService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Recuperer une activite par UUID (avec participants)' })
  @ApiParam({ name: 'uuid', description: 'UUID de l activite' })
  @ApiResponse({ status: 200, description: 'Activite trouvee.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.activityService.findOne(uuid, req.user.uuid as string);
  }

  @Put(':uuid')
  @ApiOperation({ summary: 'Modifier une activite' })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: UpdateActivityDto })
  @ApiResponse({ status: 200, description: 'Activite modifiee avec succes.' })
  @ApiResponse({ status: 400, description: 'Champs invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  update(@Param('uuid') uuid: string, @Body() payload: UpdateActivityDto, @Request() req) {
    return this.activityService.update(uuid, payload, req.user.uuid as string);
  }

  @Put(':uuid/status')
  @ApiOperation({ summary: 'Changer le statut d une activite' })
  @ApiParam({ name: 'uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { status: { type: 'string', enum: Object.values(GlobalStatus) } },
      required: ['status'],
    },
  })
  @ApiResponse({ status: 200, description: 'Statut modifie avec succes.' })
  @ApiResponse({ status: 400, description: 'Statut invalide.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  changeStatus(@Param('uuid') uuid: string, @Body('status') status: GlobalStatus, @Request() req) {
    return this.activityService.changeStatus(uuid, status, req.user.uuid as string);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une activite (soft delete)' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Activite supprimee avec succes.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    return this.activityService.delete(uuid, req.user.uuid as string);
  }

  // ============================================================
  // CIBLAGE
  // ============================================================

  @Post(':uuid/targets/preview')
  @ApiOperation({
    summary: 'Previsualiser les cibles selon les criteres de l activite',
    description:
      'Retourne le total et un echantillon (200 max). Body optionnel pour overrider les criteres stockes.',
  })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: ResolveTargetsDto, required: false })
  @ApiResponse({ status: 200, description: 'Apercu calcule.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  previewTargets(@Param('uuid') uuid: string, @Body() override: ResolveTargetsDto, @Request() req) {
    return this.targetService.preview(uuid, override, req.user.uuid as string);
  }

  @Post('targets/preview')
  @ApiOperation({
    summary: 'Previsualiser des cibles ad hoc (sans activite existante)',
    description: 'Utile au formulaire de creation pour montrer le nombre de cibles en temps reel.',
  })
  @ApiBody({ type: ResolveTargetsDto })
  @ApiResponse({ status: 200, description: 'Apercu calcule.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  previewAdHocTargets(@Body() criteria: ResolveTargetsDto, @Request() req) {
    return this.targetService.preview(null, criteria, req.user.uuid as string);
  }

  @Post(':uuid/participants/auto-assign')
  @ApiOperation({
    summary: 'Auto-assigner les membres cibles comme participants. Idempotent.',
    description: 'Sautent silencieusement les membres deja inscrits. Body optionnel pour overrider.',
  })
  @ApiParam({ name: 'uuid' })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ActivityParticipantRole,
    description: 'Role applique aux nouveaux participants (defaut : participant)',
  })
  @ApiBody({ type: ResolveTargetsDto, required: false })
  @ApiResponse({ status: 200, description: 'Participants ajoutes.' })
  @ApiResponse({ status: 400, description: 'Criteres invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  autoAssign(
    @Param('uuid') uuid: string,
    @Body() override: ResolveTargetsDto,
    @Request() req,
    @Query('role') role?: ActivityParticipantRole,
  ) {
    return this.targetService.autoAssign(
      uuid,
      override,
      role ?? ActivityParticipantRole.PARTICIPANT,
      req.user.uuid as string,
    );
  }

  // ============================================================
  // PARTICIPANTS
  // ============================================================

  @Get(':uuid/participants')
  @ApiOperation({ summary: 'Liste des participants d une activite' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Liste des participants.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  listParticipants(@Param('uuid') activity_uuid: string, @Request() req) {
    return this.participantService.list(activity_uuid, req.user.uuid as string);
  }

  @Post(':uuid/participants')
  @ApiOperation({ summary: 'Assigner des membres comme participants (bulk)' })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: AssignParticipantsDto })
  @ApiResponse({ status: 201, description: 'Participants assignes.' })
  @ApiResponse({ status: 400, description: 'Liste invalide.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite ou membres introuvables.' })
  assignParticipants(
    @Param('uuid') activity_uuid: string,
    @Body() payload: AssignParticipantsDto,
    @Request() req,
  ) {
    return this.participantService.assign(activity_uuid, payload, req.user.uuid as string);
  }

  @Put('participants/:participant_uuid/role')
  @ApiOperation({ summary: 'Changer le role d un participant' })
  @ApiParam({ name: 'participant_uuid' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { role: { type: 'string', enum: Object.values(ActivityParticipantRole) } },
      required: ['role'],
    },
  })
  @ApiResponse({ status: 200, description: 'Role modifie.' })
  @ApiResponse({ status: 400, description: 'Role invalide.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Participant introuvable.' })
  changeParticipantRole(
    @Param('participant_uuid') participant_uuid: string,
    @Body('role') role: ActivityParticipantRole,
    @Request() req,
  ) {
    return this.participantService.changeRole(participant_uuid, role, req.user.uuid as string);
  }

  @Delete('participants/:participant_uuid')
  @ApiOperation({ summary: 'Retirer un participant (soft delete)' })
  @ApiParam({ name: 'participant_uuid' })
  @ApiResponse({ status: 200, description: 'Participant retire.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Participant introuvable.' })
  removeParticipant(@Param('participant_uuid') participant_uuid: string, @Request() req) {
    return this.participantService.remove(participant_uuid, req.user.uuid as string);
  }

  // ============================================================
  // PRESENCE
  // ============================================================

  @Get(':uuid/attendance')
  @ApiOperation({
    summary: 'Feuille de presence (participants x pointage fusionnes)',
    description: 'Inclut les inscrits non encore pointes (present=false, arrived_at=null).',
  })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Feuille de presence retournee.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  attendanceListing(@Param('uuid') activity_uuid: string, @Request() req) {
    return this.attendanceService.listing(activity_uuid, req.user.uuid as string);
  }

  @Post(':uuid/attendance')
  @ApiOperation({ summary: 'Marquer la presence d un membre' })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: MarkAttendanceDto })
  @ApiResponse({ status: 201, description: 'Presence enregistree.' })
  @ApiResponse({ status: 400, description: 'Champs invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite ou membre introuvable.' })
  markAttendance(
    @Param('uuid') activity_uuid: string,
    @Body() payload: MarkAttendanceDto,
    @Request() req,
  ) {
    return this.attendanceService.mark(activity_uuid, payload, req.user.uuid as string);
  }

  @Post(':uuid/attendance/bulk')
  @ApiOperation({ summary: 'Marquer la presence en masse (bulk)' })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: BulkMarkAttendanceDto })
  @ApiResponse({ status: 201, description: 'Presence en masse enregistree.' })
  @ApiResponse({ status: 400, description: 'Liste vide ou invalide.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  markAttendanceBulk(
    @Param('uuid') activity_uuid: string,
    @Body() payload: BulkMarkAttendanceDto,
    @Request() req,
  ) {
    return this.attendanceService.markBulk(activity_uuid, payload, req.user.uuid as string);
  }

  // ============================================================
  // STATISTIQUES
  // ============================================================

  @Get(':uuid/stats')
  @ApiOperation({
    summary: 'Statistiques d une activite',
    description: 'Taux de presence global, par structure, par role.',
  })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Statistiques calculees.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  statsForActivity(@Param('uuid') activity_uuid: string, @Request() req) {
    return this.statsService.forActivity(activity_uuid, req.user.uuid as string);
  }

  @Get('stats/dashboard')
  @ApiOperation({
    summary: 'Dashboard activites du perimetre du responsable',
    description: 'Si structure_uuid fourni, restreint au sous-arbre via findByAllChildrens.',
  })
  @ApiQuery({
    name: 'structure_uuid',
    required: false,
    description: 'UUID de la structure racine pour filtrer le perimetre',
  })
  @ApiResponse({ status: 200, description: 'Dashboard du responsable.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Auteur introuvable.' })
  dashboard(@Request() req, @Query('structure_uuid') structure_uuid?: string) {
    return this.statsService.dashboard(req.user.uuid as string, structure_uuid);
  }

  // ============================================================
  // QUOTAS
  // ============================================================

  @Get(':uuid/quotas')
  @ApiOperation({ summary: 'Liste des quotas par structure pour une activité' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Liste des quotas.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  listQuotas(@Param('uuid') activity_uuid: string, @Request() req) {
    return this.quotaService.list(activity_uuid, req.user.uuid as string);
  }

  @Get(':uuid/quotas/summary')
  @ApiOperation({ summary: 'Récapitulatif des quotas alloués/utilisés pour une activité' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Récapitulatif des quotas.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  quotaSummary(@Param('uuid') activity_uuid: string, @Request() req) {
    return this.quotaService.summary(activity_uuid, req.user.uuid as string);
  }

  @Post(':uuid/quotas')
  @ApiOperation({ summary: 'Créer un quota pour une structure dans une activité' })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: CreateActivityQuotaDto })
  @ApiResponse({ status: 201, description: 'Quota créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite ou structure introuvable.' })
  @ApiResponse({ status: 409, description: 'Quota déjà existant pour cette structure.' })
  createQuota(
    @Param('uuid') activity_uuid: string,
    @Body() payload: CreateActivityQuotaDto,
    @Request() req,
  ) {
    return this.quotaService.create(activity_uuid, payload, req.user.uuid as string);
  }

  @Put('quotas/:quota_uuid')
  @ApiOperation({ summary: 'Modifier un quota' })
  @ApiParam({ name: 'quota_uuid' })
  @ApiBody({ type: UpdateActivityQuotaDto })
  @ApiResponse({ status: 200, description: 'Quota modifié.' })
  @ApiResponse({ status: 400, description: 'Valeur invalide.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Quota introuvable.' })
  updateQuota(
    @Param('quota_uuid') uuid: string,
    @Body() payload: UpdateActivityQuotaDto,
    @Request() req,
  ) {
    return this.quotaService.update(uuid, payload, req.user.uuid as string);
  }

  @Delete('quotas/:quota_uuid')
  @ApiOperation({ summary: 'Supprimer un quota (soft delete)' })
  @ApiParam({ name: 'quota_uuid' })
  @ApiResponse({ status: 200, description: 'Quota supprimé.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Quota introuvable.' })
  deleteQuota(@Param('quota_uuid') uuid: string, @Request() req) {
    return this.quotaService.remove(uuid, req.user.uuid as string);
  }

  // ============================================================
  // COMITE D'ORGANISATION
  // ============================================================

  @Get(':uuid/committees')
  @ApiOperation({ summary: "Liste des comités d'organisation d'une activité" })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Liste des comités.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  listCommittees(@Param('uuid') activity_uuid: string, @Request() req) {
    return this.committeeService.listCommittees(activity_uuid, req.user.uuid as string);
  }

  @Post(':uuid/committees')
  @ApiOperation({ summary: "Créer un comité d'organisation pour une activité" })
  @ApiParam({ name: 'uuid' })
  @ApiBody({ type: CreateActivityCommitteeDto })
  @ApiResponse({ status: 201, description: 'Comité créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs invalides.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Activite introuvable.' })
  createCommittee(
    @Param('uuid') activity_uuid: string,
    @Body() payload: CreateActivityCommitteeDto,
    @Request() req,
  ) {
    return this.committeeService.createCommittee(activity_uuid, payload, req.user.uuid as string);
  }

  @Get('committees/:committee_uuid')
  @ApiOperation({ summary: "Récupérer un comité par UUID (avec ses membres)" })
  @ApiParam({ name: 'committee_uuid' })
  @ApiResponse({ status: 200, description: 'Comité trouvé.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Comité introuvable.' })
  findOneCommittee(@Param('committee_uuid') uuid: string, @Request() req) {
    return this.committeeService.findOneCommittee(uuid, req.user.uuid as string);
  }

  @Put('committees/:committee_uuid')
  @ApiOperation({ summary: "Modifier un comité d'organisation" })
  @ApiParam({ name: 'committee_uuid' })
  @ApiBody({ type: UpdateActivityCommitteeDto })
  @ApiResponse({ status: 200, description: 'Comité modifié.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Comité introuvable.' })
  updateCommittee(
    @Param('committee_uuid') uuid: string,
    @Body() payload: UpdateActivityCommitteeDto,
    @Request() req,
  ) {
    return this.committeeService.updateCommittee(uuid, payload, req.user.uuid as string);
  }

  @Delete('committees/:committee_uuid')
  @ApiOperation({ summary: "Supprimer un comité (soft delete)" })
  @ApiParam({ name: 'committee_uuid' })
  @ApiResponse({ status: 200, description: 'Comité supprimé.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Comité introuvable.' })
  deleteCommittee(@Param('committee_uuid') uuid: string, @Request() req) {
    return this.committeeService.deleteCommittee(uuid, req.user.uuid as string);
  }

  // ---- Membres des comités ----

  @Get('committees/:committee_uuid/members')
  @ApiOperation({ summary: 'Liste des membres d\'un comité' })
  @ApiParam({ name: 'committee_uuid' })
  @ApiResponse({ status: 200, description: 'Liste des membres.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Comité introuvable.' })
  listCommitteeMembers(@Param('committee_uuid') committee_uuid: string, @Request() req) {
    return this.committeeService.listCommitteeMembers(committee_uuid, req.user.uuid as string);
  }

  @Post('committees/:committee_uuid/members')
  @ApiOperation({ summary: 'Ajouter un membre à un comité' })
  @ApiParam({ name: 'committee_uuid' })
  @ApiBody({ type: CreateActivityCommitteeMemberDto })
  @ApiResponse({ status: 201, description: 'Membre ajouté au comité.' })
  @ApiResponse({ status: 400, description: 'Champs invalides ou déjà président.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Comité ou membre introuvable.' })
  @ApiResponse({ status: 409, description: 'Membre déjà dans ce comité.' })
  addCommitteeMember(
    @Param('committee_uuid') committee_uuid: string,
    @Body() payload: CreateActivityCommitteeMemberDto,
    @Request() req,
  ) {
    return this.committeeService.addCommitteeMember(committee_uuid, payload, req.user.uuid as string);
  }

  @Put('committees/members/:member_uuid')
  @ApiOperation({ summary: 'Modifier le rôle ou la commission d\'un membre du comité' })
  @ApiParam({ name: 'member_uuid' })
  @ApiBody({ type: UpdateActivityCommitteeMemberDto })
  @ApiResponse({ status: 200, description: 'Membre du comité mis à jour.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Membre du comité introuvable.' })
  updateCommitteeMember(
    @Param('member_uuid') uuid: string,
    @Body() payload: UpdateActivityCommitteeMemberDto,
    @Request() req,
  ) {
    return this.committeeService.updateCommitteeMember(uuid, payload, req.user.uuid as string);
  }

  @Delete('committees/members/:member_uuid')
  @ApiOperation({ summary: 'Retirer un membre d\'un comité (soft delete)' })
  @ApiParam({ name: 'member_uuid' })
  @ApiResponse({ status: 200, description: 'Membre retiré du comité.' })
  @ApiResponse({ status: 401, description: 'Non autorise.' })
  @ApiResponse({ status: 404, description: 'Membre du comité introuvable.' })
  removeCommitteeMember(@Param('member_uuid') uuid: string, @Request() req) {
    return this.committeeService.removeCommitteeMember(uuid, req.user.uuid as string);
  }
}
