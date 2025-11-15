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

@ApiTags('Paiement d’abonnement')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscription-payments')
export class SubscriptionPaymentController {
  constructor(
    private readonly subscriptionPaymentService: SubscriptionPaymentService,
  ) {}

  // ============================================================
  // INITIER UN PAIEMENT D’ABONNEMENT
  // ============================================================
  @Post()
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

  // ============================================================
  // LISTE PAGINÉE
  // ============================================================
  @Get()
  @ApiOperation({ summary: 'Liste paginée des paiements d’abonnements' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Request() req,
  ) {
    return this.subscriptionPaymentService.findAll(
      +page,
      +limit,
      req.user.uuid,
    );
  }

  // ============================================================
  // RÉCUPÉRER UN PAIEMENT
  // ============================================================
  @Get(':uuid')
  @ApiOperation({ summary: 'Détail d’un paiement d’abonnement' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Détail du paiement' })
  async findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.subscriptionPaymentService.findOne(uuid, req.user.uuid);
  }


  // ============================================================
  // CHANGER STATUT
  // ============================================================
  @Put(':uuid/status')
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

  // ============================================================
  // CALLBACK CINETPAY (⚠️ PUBLIC ROUTE)
  // ============================================================
  @Post('cinetpay/callback')
  @ApiOperation({ summary: 'Callback CinetPay pour confirmer un paiement' })
  @ApiResponse({ status: 200, description: 'Paiement confirmé' })
  async cinetPayCallback(@Body() body: any, @Request() req) {
    // ⚠️ Le callback CinetPay NE DOIT PAS être protégé
    return this.subscriptionPaymentService.confirmPayment(body, req.user.uuid);
  }

}
