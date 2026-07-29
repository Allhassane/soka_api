import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { Public } from 'src/shared/decorators/public.decorator';
import { SokaPayService } from './sokapay.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

/**
 * Intégration SOKA → SOKA Pay.
 *  - `POST /payments/checkout` (authentifié) : crée une session OU un lien via
 *    SOKA Pay et renvoie l'`url` du guichet au front SOKA.
 *  - `GET  /payments/soka-pay/:uuid` (authentifié) : statut de la transaction.
 */
@ApiTags('SOKA Pay')
@ApiBearerAuth()
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class SokaPayController {
  constructor(private readonly sokaPay: SokaPayService) {}

  @Post('checkout')
  @ApiOperation({ summary: 'Créer un checkout SOKA Pay (session ou lien) et obtenir l’URL du guichet' })
  @ApiResponse({ status: 201, description: 'Checkout créé : { url, transactionUuid, mode }.' })
  createCheckout(@Body() dto: CreateCheckoutDto, @Request() req: { user?: { uuid?: string } }) {
    return this.sokaPay.createCheckout(dto, req.user?.uuid);
  }

  @Get('soka-pay/:uuid')
  @ApiOperation({ summary: 'Statut d’une transaction SOKA Pay' })
  getTransaction(@Param('uuid') uuid: string) {
    return this.sokaPay.getTransaction(uuid);
  }
}

/**
 * Réception des callbacks signés de SOKA Pay.
 * Route PUBLIQUE (pas de JWT) : l'authenticité vient de la signature HMAC
 * (`Soka-Pay-Signature`). Lit le corps BRUT pour vérifier la signature.
 */
@ApiTags('SOKA Pay')
@Controller('webhooks')
export class SokaPayWebhookController {
  constructor(private readonly sokaPay: SokaPayService) {}

  @Public()
  @Post('soka-pay')
  @ApiOperation({ summary: 'Webhook signé SOKA Pay (HMAC) - marque la cotisation réglée (idempotent)' })
  webhook(@Req() req: RawBodyRequest<ExpressRequest>) {
    const signature = req.headers['soka-pay-signature'] as string | undefined;
    return this.sokaPay.handleWebhook(req.rawBody, signature);
  }
}
