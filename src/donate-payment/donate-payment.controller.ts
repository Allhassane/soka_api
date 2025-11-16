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

@ApiTags('Paiement de don')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('donate-payments')
export class DonatePaymentController {
  constructor(private readonly donatePaymentService: DonatePaymentService) {}


  @Post()
  @ApiOperation({ summary: 'Initier un paiement de don + redirection CinetPay' })
  @ApiResponse({ status: 201, description: 'Paiement créé avec succès' })
  @ApiResponse({ status: 400, description: 'Données invalides' })
  async makeDonation(@Body() dto: MakeDonationPaymentDto, @Request() req) {
    return this.donatePaymentService.makeDonation(dto, req.user.uuid);
  }


  @Get()
  @ApiOperation({ summary: 'Liste paginée des dons' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  async findAll(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Request() req,
  ) {
    return this.donatePaymentService.findAll(+page, +limit, req.user.uuid);
  }


  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer un paiement de don par UUID' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Détail du don' })
  async findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.donatePaymentService.findOne(uuid, req.user.uuid);
  }


  @Put(':uuid')
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



  @Post('cinetpay/check/status/:transaction_id')
  @ApiOperation({ summary: 'Vérifier le statut d’un paiement CinetPay' })
  @ApiResponse({ status: 200, description: 'Statut du paiement vérifié' })
  async cinetPayCheckStatus(
    @Param('transaction_id') transaction_id: string,
    @Request() req,
  ) {
    // On passe un payload minimal au service
    return this.donatePaymentService.confirmPayment(
      { transaction_id },
      req.user.uuid, // si ta route est protégée et que confirmPayment attend encore admin_uuid
    );
  }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer un paiement de don' })
  @ApiParam({ name: 'uuid' })
  @ApiResponse({ status: 200, description: 'Supprimé avec succès' })
  async delete(@Param('uuid') uuid: string, @Request() req) {
    return this.donatePaymentService.delete(uuid, req.user.uuid);
  }
}
