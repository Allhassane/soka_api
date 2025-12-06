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

@ApiTags('Paiement d’abonnement')

@Controller('subscription-payments')
export class SubscriptionPaymentController {
  constructor(
    private readonly subscriptionPaymentService: SubscriptionPaymentService,
  ) {}

  @Post()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
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
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
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



  @Get(':uuid')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Détail d’un paiement d’abonnement' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Détail du paiement' })
  async findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.subscriptionPaymentService.findOne(uuid, req.user.uuid);
  }


  @Put(':uuid/status')
  @ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
