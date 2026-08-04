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
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { SubscriptionPaymentService } from './subscription-payment.service';
import { MakeSubscriptionPaymentDto } from './dto/make-subscription-payment';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiTags('Paiement d’abonnement')

@Controller('subscription-payments')
// Gardes au niveau CLASSE : elles étaient posées route par route, et la route
// `POST cinetpay/check/status/:transaction_id` avait été oubliée - son `@RequirePermissions`
// était donc inopérant ET la route ouverte sans authentification.
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SubscriptionPaymentController {
  constructor(
    private readonly subscriptionPaymentService: SubscriptionPaymentService,
  ) {}

  @Post()
  @RequirePermissions('abonnements_paiements_creer')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Initier un paiement d’abonnement (CinetPay)' })
  @ApiResponse({ status: 201, description: 'Paiement créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  async makeSubscription(
    @Body() dto: MakeSubscriptionPaymentDto,
    @Request() req,
  ) {
    return this.subscriptionPaymentService.makeSubscription(
      dto,
      req.user.uuid,
    );
  }

  @Get()
  @RequirePermissions('abonnements_paiements_voir')
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
    return this.subscriptionPaymentService.findAll(
      +page,
      +limit,
      req.user.uuid,
      search,
    );
  }



  /**
   * ⚠️ Déclarée AVANT `@Get(':uuid')`, comme « quota » : sinon le segment statique « mine »
   * serait avalé par la route dynamique, qui chercherait un paiement d'uuid « mine ».
   *
   * Permission `..._creer` et non `..._voir` : `abonnements_paiements_voir` ouvre la liste
   * des paiements de TOUT un périmètre hiérarchique (droit à 0 pour le rôle MEMBRE) ; cette
   * route-ci ne rend que les lignes de l'appelant lui-même, donc exactement la population
   * autorisée à souscrire. Réutiliser un slug déjà accordé évite en prime d'attendre une
   * reconnexion : les droits d'affichage du web sont posés au login.
   */
  @Get('mine')
  @RequirePermissions('abonnements_paiements_creer')
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      "Mes souscriptions : les lignes dont je suis bénéficiaire ou payeur (pour un tiers)",
  })
  @ApiQuery({
    name: 'subscription_uuid',
    required: false,
    description: 'Limiter à une campagne (fiche campagne). Omis = toutes campagnes.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  async findMine(
    @Request() req,
    @Query('subscription_uuid') subscription_uuid?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.subscriptionPaymentService.findMine(
      req.user.uuid,
      subscription_uuid,
      +page,
      +limit,
    );
  }

  /**
   * ⚠️ Déclarée AVANT `@Get(':uuid')` : sinon le segment statique « quota » serait avalé par
   * la route dynamique, qui chercherait un paiement d'uuid « quota ».
   *
   * Permission `..._creer` et non `..._voir` : c'est l'écran de paiement qui l'appelle, donc
   * exactement la population autorisée à payer - un membre qui règle son abonnement n'a pas
   * forcément le droit de consulter la liste des paiements.
   */
  @Get('quota')
  @RequirePermissions('abonnements_paiements_creer')
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Quota restant d'un bénéficiaire sur une campagne d'abonnement",
  })
  @ApiQuery({ name: 'subscription_uuid', required: true })
  @ApiQuery({ name: 'beneficiary_uuid', required: true })
  async getBeneficiaryQuota(
    @Query('subscription_uuid') subscriptionUuid: string,
    @Query('beneficiary_uuid') beneficiaryUuid: string,
    @Request() req,
  ) {
    return this.subscriptionPaymentService.getBeneficiaryQuota(
      subscriptionUuid,
      beneficiaryUuid,
      req.user.uuid,
    );
  }

  @Get(':uuid')
  @RequirePermissions('abonnements_paiements_voir')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Détail d’un paiement d’abonnement' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Détail du paiement' })
  async findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.subscriptionPaymentService.findOne(uuid, req.user.uuid);
  }


  @Put(':uuid/status')
  @RequirePermissions('abonnements_paiements_modifier')
  @ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Changer le statut du paiement d’abonnement' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Statut changé' })
  async changeStatus(
    @Param('uuid') uuid: string,
    @Body('status') status: GlobalStatus,
    @Request() req,
  ) {
    return this.subscriptionPaymentService.changeStatus(
      uuid,
      status,
      req.user.uuid,
    );
  }

  // ========================================
@Post('cinetpay/check/status/:transaction_id')
@RequirePermissions('abonnements_paiements_creer')
@ApiOperation({ summary: 'Vérifier le statut d’un paiement CinetPay' })
@ApiResponse({ status: 200, description: 'Statut du paiement vérifié' })
async cinetPayCheckStatus(
  @Param('transaction_id') transaction_id: string,
) {
  // On passe un payload minimal au service
  return this.subscriptionPaymentService.confirmPayment(
    { transaction_id },
    '', // si ta route est protégée et que confirmPayment attend encore admin_uuid
  );
}


}
