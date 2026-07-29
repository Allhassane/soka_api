import { allowedRootUuidsFromJwt } from 'src/access-scope/perimeter-from-jwt';
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
import {
  CreateMemberTransferDto,
  ImpactPreviewDto,
} from './dto/create-member-transfer.dto';
import {
  ApproveMemberTransferDto,
  RejectMemberTransferDto,
} from './dto/decide-member-transfer.dto';
import { TransferStatus } from './entities/member-transfer.entity';
import {
  MemberTransferService,
  PerimeterContext,
} from './member-transfer.service';

@ApiBearerAuth()
@ApiTags('Transferts de membres')
@Controller('member-transfers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MemberTransferController {
  constructor(private readonly transferService: MemberTransferService) {}

  /**
   * Périmètre du connecté, dérivé du JWT - même logique que `buildPerimeter`
   * (`structure.controller.ts`) : les structures de ses responsabilités font office de racines.
   */
  private perimeter(req): PerimeterContext {
    const user = req?.user ?? {};
    return {
      userUuid: user.uuid,
      userId: user.sub,
      isAdmin: user.is_admin === true,
      // Racine unique issue du token : couvre responsabilités ET comités (cf. helper).
      allowedRootUuids: allowedRootUuidsFromJwt(user),
    };
  }

  @Post('impact-preview')
  @RequirePermissions('membres_initier_transfert')
  @ApiOperation({
    summary: 'Aperçu des responsabilités perdues si les membres rejoignaient le district cible',
  })
  @ApiResponse({ status: 201, description: 'Impact calculé.' })
  impactPreview(@Body() payload: ImpactPreviewDto, @Req() req) {
    return this.transferService.impactPreview(payload, this.perimeter(req));
  }

  @Post()
  @RequirePermissions('membres_initier_transfert')
  @ApiOperation({ summary: 'Créer une demande de transfert vers un district' })
  @ApiResponse({ status: 201, description: 'Demande créée.' })
  @ApiResponse({ status: 400, description: 'Même district, rattachement incompatible, ou districts sources multiples.' })
  @ApiResponse({ status: 409, description: 'Une demande est déjà en attente pour un des membres.' })
  create(@Body() payload: CreateMemberTransferDto, @Req() req) {
    return this.transferService.create(payload, this.perimeter(req));
  }

  @Get('incoming')
  @RequirePermissions('membres_approuver_transfert')
  @ApiOperation({ summary: 'Demandes à traiter (district cible dans mon périmètre)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: TransferStatus })
  listIncoming(
    @Req() req,
    @Query('page') page = 1,
    @Query('limit') limit = 15,
    @Query('status') status?: TransferStatus,
  ) {
    return this.transferService.listIncoming(
      this.perimeter(req),
      Number(page),
      Number(limit),
      status,
    );
  }

  @Get('outgoing')
  @RequirePermissions('membres_initier_transfert')
  @ApiOperation({ summary: 'Demandes parties de mon périmètre' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: TransferStatus })
  listOutgoing(
    @Req() req,
    @Query('page') page = 1,
    @Query('limit') limit = 15,
    @Query('status') status?: TransferStatus,
  ) {
    return this.transferService.listOutgoing(
      this.perimeter(req),
      Number(page),
      Number(limit),
      status,
    );
  }

  @Get('member/:memberUuid/history')
  @RequirePermissions('membres_acceder_alonglet_membre')
  @ApiOperation({ summary: "Historique de mobilité d'un membre" })
  @ApiParam({ name: 'memberUuid', description: 'UUID du membre' })
  memberHistory(@Param('memberUuid') memberUuid: string) {
    return this.transferService.memberHistory(memberUuid);
  }

  @Get(':uuid')
  @RequirePermissions('membres_voir_menu_transferts')
  @ApiOperation({ summary: 'Détail d’une demande, avec impact recalculé' })
  @ApiParam({ name: 'uuid', description: 'UUID de la demande' })
  findOne(@Param('uuid') uuid: string, @Req() req) {
    return this.transferService.findOne(uuid, this.perimeter(req));
  }

  @Post(':uuid/approve')
  @RequirePermissions('membres_approuver_transfert')
  @ApiOperation({
    summary: "Approuver : fixe la structure d'accueil de chaque membre et applique le transfert",
  })
  @ApiResponse({ status: 409, description: 'Demande déjà traitée, ou devenue obsolète (membre déplacé entre-temps).' })
  approve(
    @Param('uuid') uuid: string,
    @Body() payload: ApproveMemberTransferDto,
    @Req() req,
  ) {
    return this.transferService.approve(uuid, payload, this.perimeter(req));
  }

  @Post(':uuid/reject')
  @RequirePermissions('membres_approuver_transfert')
  @ApiOperation({ summary: 'Refuser la demande (motif obligatoire)' })
  reject(
    @Param('uuid') uuid: string,
    @Body() payload: RejectMemberTransferDto,
    @Req() req,
  ) {
    return this.transferService.reject(uuid, payload, this.perimeter(req));
  }

  @Post(':uuid/cancel')
  @RequirePermissions('membres_initier_transfert')
  @ApiOperation({ summary: 'Annuler sa propre demande tant qu’elle est en attente' })
  cancel(@Param('uuid') uuid: string, @Req() req) {
    return this.transferService.cancel(uuid, this.perimeter(req));
  }
}
