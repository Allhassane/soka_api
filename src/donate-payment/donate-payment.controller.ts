import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { DonatePaymentService } from './donate-payment.service';
import { MakeDonationPaymentDto } from '../donate-payment/dto/make-donation-payment';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { Public } from 'src/shared/decorators/public.decorator';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiTags('Paiement de don')

@Controller('donate-payments')
export class DonatePaymentController {
  constructor(private readonly donatePaymentService: DonatePaymentService) {}


  @Post()
  @RequirePermissions('dons_paiements_creer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Initier un paiement de don + redirection CinetPay' })
  @ApiResponse({ status: 201, description: 'Paiement créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  async makeDonation(@Body() dto: MakeDonationPaymentDto, @Request() req) {
    return this.donatePaymentService.makeDonation(dto, req.user.uuid);
  }


  @Get()
  @RequirePermissions('dons_paiements_voir')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Liste paginée des paiements d’abonnements' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, description: 'Recherche par nom ou prénom' })

  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Request() req,
    @Query('search') search?: string | undefined,
  ) {
    return this.donatePaymentService.findAll(
      +page,
      +limit,
      req.user.uuid,
      search,
    );
  }

  /**
   * ⚠️ Déclarée AVANT `@Get(':uuid')` : sinon le segment statique « quota » serait avalé par la
   * route dynamique, qui chercherait un paiement d'uuid « quota ».
   *
   * Permission `..._creer` : c'est l'écran de paiement qui l'appelle, donc exactement la
   * population autorisée à donner. Le bénéficiaire est toujours le membre connecté.
   */
  @Get('quota')
  @RequirePermissions('dons_paiements_creer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({
    summary: 'Quota de zaimu restant pour le membre connecté sur une campagne',
  })
  @ApiQuery({ name: 'donate_uuid', required: true })
  async getMyQuota(@Query('donate_uuid') donateUuid: string, @Request() req) {
    return this.donatePaymentService.getMyQuota(donateUuid, req.user.uuid);
  }

  @Get(':uuid')
  @RequirePermissions('dons_paiements_voir')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Récupérer un paiement de don par UUID' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Détail du don' })
  async findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.donatePaymentService.findOne(uuid, req.user.uuid);
  }


  @Put(':uuid')
  @RequirePermissions('dons_paiements_modifier')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Modifier un paiement de don' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Données modifiées avec succès' })
  async update(
    @Param('uuid') uuid: string,
    @Body() body: any,
    @Request() req,
  ) {
    return this.donatePaymentService.update(uuid, body, req.user.uuid);
  }


  @Put(':uuid/status')
  @RequirePermissions('dons_paiements_modifier')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Changer le statut du paiement de don' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Statut modifié' })
  async changeStatus(
    @Param('uuid') uuid: string,
    @Body('status') status: GlobalStatus,
    @Request() req,
  ) {
    return this.donatePaymentService.changeStatus(uuid, status, req.user.uuid);
  }


  @Public()
  @Post('hub/check/status/:transaction_id')
  // Pas de @RequirePermissions : route @Public() (webhook du prestataire, authentifié
  // par signature). Le décorateur y était inopérant et laissait croire à un contrôle.
  @ApiOperation({ summary: 'Vérifier le statut d’un paiement Hub' })
  @ApiResponse({ status: 200, description: 'Statut du paiement vérifié' })
  async hubCheckStatus(@Param('transaction_id') transaction_id: string) {
    return this.donatePaymentService.confirmHubPayment(
      { transaction_id },
      '',
    );
  }

  /**
   * Annule une tentative de paiement encore en cours (bouton « Annuler » des
   * listes Abonnements et Zaimu). Sert les DEUX modules, comme `hub/check/status`.
   *
   * ⚠️ **Volontairement NON `@Public()`**, contrairement à la vérification :
   * annuler est une écriture destructrice. Ouverte, cette route permettrait à
   * quiconque de refermer les paiements en cours d'autrui en devinant un
   * `transaction_id`.
   */
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('paiements_modifier')
  @Post('hub/cancel/:transaction_id')
  @ApiOperation({
    summary: 'Annuler une tentative de paiement Hub encore en cours',
  })
  @ApiResponse({ status: 200, description: 'Tentative annulée (ou déjà aboutie)' })
  async hubCancel(@Param('transaction_id') transaction_id: string) {
    return this.donatePaymentService.cancelHubPayment(transaction_id);
  }

  @Public()
  @Post('cinetpay/check/status/:transaction_id')
  // Pas de @RequirePermissions : route @Public() (webhook du prestataire, authentifié
  // par signature). Le décorateur y était inopérant et laissait croire à un contrôle.
  @ApiOperation({ summary: 'Vérifier le statut d’un paiement CinetPay' })
  @ApiResponse({ status: 200, description: 'Statut du paiement vérifié' })
  async cinetPayCheckStatus(
    @Param('transaction_id') transaction_id: string,
  ) {
    // On passe un payload minimal au service
    return this.donatePaymentService.confirmPayment(
      { transaction_id },
      '', // si ta route est protégée et que confirmPayment attend encore admin_uuid
    );
  }


  @Delete(':uuid')
  @RequirePermissions('dons_paiements_supprimer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Supprimer un paiement de don' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Supprimé avec succès' })
  async delete(@Param('uuid') uuid: string, @Request() req) {
    return this.donatePaymentService.delete(uuid, req.user.uuid);
  }
}
