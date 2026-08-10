import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { RejectMemberRegistrationDto } from './dto/decide-member-registration.dto';
import { RegistrationStatus } from './entities/member-registration.entity';
import {
  MemberRegistrationService,
  RegistrationContext,
} from './member-registration.service';

@ApiBearerAuth()
@ApiTags('Validation des enregistrements')
@Controller('member-registrations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MemberRegistrationController {
  constructor(private readonly registrations: MemberRegistrationService) {}

  /** Contexte du connecté. `sub` est la PK numérique, seule acceptée par le journal d'audit. */
  private context(req): RegistrationContext {
    const user = req?.user ?? {};
    return {
      userUuid: user.uuid,
      userId: user.sub,
      isAdmin: user.is_admin === true,
    };
  }

  @Get('pending')
  @RequirePermissions('membres_valider_district', 'membres_valider_chapitre')
  @ApiOperation({
    summary: 'Dossiers que je peux signer maintenant, du plus ancien au plus récent',
    description:
      "L'ancienneté est le seul signal d'un dossier oublié : la liste est donc triée par dépôt le plus ancien, et chaque ligne porte son `age_days`.",
  })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Liste des dossiers à valider.' })
  pending(@Req() req, @Query('page') page = 1, @Query('limit') limit = 15) {
    return this.registrations.pending(
      this.context(req),
      Number(page),
      Number(limit),
    );
  }

  @Get('pending/count')
  @RequirePermissions('membres_valider_district', 'membres_valider_chapitre')
  @ApiOperation({ summary: 'Nombre de dossiers à ma signature (badge du menu)' })
  countPending(@Req() req) {
    return this.registrations.countPending(this.context(req));
  }

  @Get('mine')
  @RequirePermissions('membres_ajouter_un_membre')
  @ApiOperation({ summary: 'Les dossiers que j’ai déposés, tous statuts confondus' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: RegistrationStatus })
  mine(
    @Req() req,
    @Query('page') page = 1,
    @Query('limit') limit = 15,
    @Query('status') status?: RegistrationStatus,
  ) {
    return this.registrations.mine(
      this.context(req),
      Number(page),
      Number(limit),
      status,
    );
  }

  @Get(':uuid')
  @RequirePermissions(
    'membres_valider_district',
    'membres_valider_chapitre',
    'membres_ajouter_un_membre',
  )
  @ApiOperation({ summary: 'Détail d’un dossier, formulaire soumis compris' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 403, description: 'Dossier hors de votre périmètre.' })
  findOne(@Param('uuid') uuid: string, @Req() req) {
    return this.registrations.findOne(uuid, this.context(req));
  }

  @Post(':uuid/approve')
  @RequirePermissions('membres_valider_district', 'membres_valider_chapitre')
  @ApiOperation({
    summary: 'Signer l’étape courante du dossier',
    description:
      "Le statut du dossier nomme l'étape attendue : c'est celle-là qui est signée. Si c'était la dernière, le membre est créé (matricule et compte de connexion compris).",
  })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 201, description: 'Étape signée.' })
  @ApiResponse({
    status: 403,
    description: 'Vous n’êtes pas responsable du niveau attendu pour ce dossier.',
  })
  @ApiResponse({
    status: 409,
    description: 'Dossier déjà tranché, ou téléphone devenu indisponible.',
  })
  approve(@Param('uuid') uuid: string, @Req() req) {
    return this.registrations.approve(uuid, this.context(req));
  }

  @Post(':uuid/reject')
  @RequirePermissions('membres_valider_district', 'membres_valider_chapitre')
  @ApiOperation({
    summary: 'Refuser le dossier — définitif',
    description:
      'Le motif est obligatoire. Un refus au chapitre annule la validation du district : elle reste tracée mais sans effet. Le dossier est clos, pas renvoyé.',
  })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 400, description: 'Motif manquant.' })
  reject(
    @Param('uuid') uuid: string,
    @Body() payload: RejectMemberRegistrationDto,
    @Req() req,
  ) {
    return this.registrations.reject(uuid, payload, this.context(req));
  }

  @Post(':uuid/cancel')
  @RequirePermissions('membres_ajouter_un_membre')
  @ApiOperation({
    summary: 'Retirer son propre dossier, tant qu’aucun signataire ne s’est prononcé',
  })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 409, description: 'Une étape a déjà été validée.' })
  cancel(@Param('uuid') uuid: string, @Req() req) {
    return this.registrations.cancel(uuid, this.context(req));
  }
}
