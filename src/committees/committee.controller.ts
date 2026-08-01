import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CommitteeService } from './committee.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { CreateCommitteeDto } from './dto/create-committe.dto';
import { UpdateCommitteeDto } from './dto/update-committe.dto';
import { AddCommitteeMemberDto } from './dto/committee-member.dto';
import { AssignResponsibleDto } from './dto/assign-responsible.dto';

/** Slug qui gouverne l'affectation de membres à un comité (cf. migration 1782700000000). */
const MANAGE_COMMITTEE_MEMBERS = 'membres_gerer_membres_comite';

// `PermissionsGuard` laisse passer toute route sans `@RequirePermissions` : le poser au niveau de
// la classe ne restreint que les deux routes décorées ci-dessous.
@ApiBearerAuth()
@ApiTags('Comite')
@Controller('comite')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CommitteeController {
  constructor(private readonly committeeService: CommitteeService) {}

  @Get()
  @RequirePermissions('comites_voir')
  @ApiOperation({ summary: 'Liste tous les comités' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.committeeService.findAll(admin_uuid);
  }

  @Post()
  @RequirePermissions('comites_creer')
  @ApiOperation({ summary: 'Créer un nouveau comité' })
  @ApiResponse({ status: 200, description: 'Comité créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateCommitteeDto, @Request() req) {
    return this.committeeService.store(payload, req.user.uuid as string);
  }

  // --- Routes statiques AVANT les routes paramétrées (:uuid) ---

  // ⚠️ OU logique (audit §M22) : un responsable qui a le droit de GÉRER les membres de son
  // comité doit pouvoir LIRE ses comités - `comites_voir` (menu Paramètres) restait à 0 pour lui.
  @Get('mine')
  @RequirePermissions('comites_voir', MANAGE_COMMITTEE_MEMBERS)
  @ApiOperation({ summary: 'Comités dont je suis responsable' })
  findMine(@Request() req) {
    return this.committeeService.findMine(req.user);
  }

  // ⚠️ OU logique : c'est la route de l'onglet « Comités » de la fiche membre, qui a son droit
  // propre au catalogue (`membres_consulter_comites_auxquels_appartient_membre`, à 1 pour
  // RESPONSABLE) - l'onglet était en erreur pour tout rôle sans le menu Paramètres → Comités.
  @Get('by-member/:memberUuid')
  @RequirePermissions('comites_voir', 'membres_consulter_comites_auxquels_appartient_membre')
  @ApiOperation({ summary: "Comités auxquels un membre est rattaché" })
  findByMember(@Param('memberUuid') memberUuid: string, @Request() req) {
    return this.committeeService.findByMember(memberUuid, req.user.uuid as string);
  }

  @Get(':uuid')
  @RequirePermissions('comites_voir')
  @ApiOperation({ summary: 'Récupérer un comité par UUID' })
  @ApiResponse({ status: 200, description: 'Comité trouvé.' })
  @ApiResponse({ status: 400, description: 'Comité non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.committeeService.findOne(uuid, admin_uuid);
  }

  @Put(':uuid')
  @RequirePermissions('comites_modifier')
  @ApiOperation({ summary: 'Modifier un comité' })
  @ApiResponse({ status: 200, description: 'Comité modifié avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
  update(
    @Param('uuid') uuid: string,
    @Request() req,
    @Body() payload: UpdateCommitteeDto,
  ) {
    return this.committeeService.update(uuid, payload, req.user.uuid);
  }

  @Delete(':uuid')
  @RequirePermissions('comites_supprimer')
  @ApiOperation({ summary: 'Supprimer un comité' })
  @ApiResponse({ status: 200, description: 'Comité supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Comité introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.committeeService.delete(uuid, admin_uuid);
  }

  // --- Responsable ---

  @Patch(':uuid/responsible')
  @RequirePermissions('comites_modifier')
  @ApiOperation({ summary: 'Désigner / retirer le responsable d’un comité' })
  assignResponsible(
    @Param('uuid') uuid: string,
    @Body() payload: AssignResponsibleDto,
    @Request() req,
  ) {
    return this.committeeService.assignResponsible(
      uuid,
      payload.member_uuid ?? null,
      req.user.uuid as string,
    );
  }

  // --- Membres du comité ---

  @Get(':uuid/members')
  @RequirePermissions('comites_voir', MANAGE_COMMITTEE_MEMBERS)
  @ApiOperation({ summary: 'Lister les membres d’un comité' })
  @ApiResponse({ status: 403, description: 'Permission manquante.' })
  listMembers(@Param('uuid') uuid: string, @Request() req) {
    // ⚠️ Cette route renvoie des données personnelles (téléphone, WhatsApp, e-mail, matricule).
    // Elle était la SEULE route `/comite` sans permission : un compte à zéro droit comité
    // lisait la composition de n'importe quel comité, y compris hors de son périmètre.
    // Le service filtre en plus les membres sur le périmètre de l'appelant - c'est cette
    // barrière qui rend acceptable le OU avec `membres_gerer_membres_comite` : sans lecture de
    // la composition, le responsable qui gère son comité travaillerait à l'aveugle.
    return this.committeeService.listMembers(uuid, req.user);
  }

  @Post(':uuid/members')
  @RequirePermissions(MANAGE_COMMITTEE_MEMBERS)
  @ApiOperation({ summary: 'Ajouter un membre au comité (responsable ou admin)' })
  @ApiResponse({ status: 403, description: 'Permission manquante ou non responsable du comité.' })
  addMember(
    @Param('uuid') uuid: string,
    @Body() payload: AddCommitteeMemberDto,
    @Request() req,
  ) {
    return this.committeeService.addMember(uuid, payload.member_uuid, req.user);
  }

  // ⚠️ OU logique (audit §M1) : `membres_retirer_membre_comite` existait au catalogue et ne
  // gardait rien - un seul droit couvrait l'ajout ET le retrait. Déjà à 1 pour RESPONSABLE.
  // `CommitteeService.canManage()` (être responsable de CE comité, ou is_admin) reste exigé en
  // plus : ce décorateur n'est que la première des deux conditions.
  @Delete(':uuid/members/:memberUuid')
  @RequirePermissions('membres_retirer_membre_comite', MANAGE_COMMITTEE_MEMBERS)
  @ApiOperation({ summary: 'Retirer un membre du comité (responsable ou admin)' })
  @ApiResponse({ status: 403, description: 'Permission manquante ou non responsable du comité.' })
  removeMember(
    @Param('uuid') uuid: string,
    @Param('memberUuid') memberUuid: string,
    @Request() req,
  ) {
    return this.committeeService.removeMember(uuid, memberUuid, req.user);
  }
}
