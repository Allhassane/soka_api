import {
  Controller,
  Post,
  Body,
  HttpCode,
  BadRequestException,
  Res,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { Response } from 'express';

@ApiTags('CinetPay Callback')
@Controller('cinetpay')
export class CinetpayCallbackController {
  constructor(
    private readonly paymentService: PaymentService,
    private readonly logService: LogActivitiesService,
  ) {}

  @Post('callback')
  @HttpCode(200) // CinetPay exige un 200 même pour les erreurs internes
  @ApiOperation({
    summary: 'Réception du callback CinetPay après un paiement',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        transaction_id: { type: 'string', example: 'TRX-1234567890' },
        amount: { type: 'string', example: '5000' }, // CinetPay renvoie une string
        currency: { type: 'string', example: 'XOF' },
        status: { type: 'string', example: 'ACCEPTED' },
        payment_method: { type: 'string', example: 'OM' },
        operator_id: { type: 'string', example: 'MP220915.2257.A76307' },
        payment_date: { type: 'string', example: '2022-09-15 22:57:15' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Callback traité',
  })
  async cinetpayCallback(@Body() payload: any,@Res() res: Response) {
    //console.log(' Callback CinetPay reçu :', payload);

    if (!payload?.transaction_id) {
      throw new BadRequestException(
        'transaction_id manquant dans le callback CinetPay',
      );
    }

    // Traitement via PaymentService
    const result = await this.paymentService.confirmCinetPayCallback(payload);

    // Log activité (pas d’utilisateur dans un callback)
    await this.logService.logAction(
      'cinetpay-callback',
      undefined,
      payload,
    );

    const returnUrl = `${process.env.CINET_RETURN_URL}/${payload.transaction_id}`;
    return res.redirect(302, returnUrl);

   /*  return {
      success: true,
      message: 'Callback CinetPay traité',
      data: result,
    }; */
  }
}
