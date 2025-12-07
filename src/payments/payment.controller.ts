import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
  Res,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';

import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PaymentService } from './payment.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { PaymentSource } from './dto/create-payment.dto';
import { Response } from 'express';
import path from 'path';
import * as fs from 'fs';

@ApiBearerAuth()
@ApiTags('Paiements')
@Controller('payments')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}



  @Get()
  @ApiOperation({ summary: 'Lister tous les paiements' })
  @ApiQuery({
    name: 'source',
    required: false,
    enum: PaymentSource,
    description: 'Filtrer par type : donation, subscription, shop_item',
  })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Query('source') source: PaymentSource, @Request() req) {
    return this.paymentService.findAll(req.user.uuid, source);
  }


  @Post()
  @ApiOperation({ summary: 'Créer un paiement (don, abonnement, boutique)' })
  @ApiResponse({ status: 201, description: 'Paiement enregistré avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs invalides.' })
  store(@Body() payload: CreatePaymentDto, @Request() req) {
    return this.paymentService.store(payload, req.user.uuid);
  }



  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer un paiement par UUID' })
  @ApiResponse({ status: 200, description: 'Paiement trouvé.' })
  @ApiResponse({ status: 404, description: 'Paiement introuvable.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.paymentService.findOne(uuid, req.user.uuid);
  }


@Get('export/subgroups')
@ApiOperation({ summary: 'Lancer l\'export des transactions en arrière-plan' })
async queueTransactionsExport(
  @Query('source_uuid') source_uuid: string,
  @Query('status') status?: GlobalStatus,
  @Request() req?,
) {
  return this.paymentService.queueTransactionsExport(
    source_uuid,
    req.user.uuid,
    req.user.member_uuid,
    req.user.responsibilities[0]?.structure?.uuid,
    status,
  );
}

@Get('async-exports/download/:jobUuid')
@ApiOperation({
  summary: 'Télécharger un export de transactions terminé',
  description: `Télécharge le fichier Excel d'un export de transactions terminé.
  Le fichier est envoyé directement dans la réponse HTTP avec les en-têtes appropriés.
  Fonctionne uniquement si le statut du job est 'COMPLETED'.`,
})
@ApiParam({
  name: 'jobUuid',
  description: 'UUID du job d\'export',
  example: 'abc-123-def-456',
  type: String,
})
@ApiResponse({
  status: 200,
  description: 'Fichier Excel téléchargé avec succès',
  content: {
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': {
      schema: {
        type: 'string',
        format: 'binary',
      },
    },
  },
  headers: {
    'Content-Type': {
      description: 'Type MIME du fichier Excel',
      schema: {
        type: 'string',
        example: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      }
    },
    'Content-Disposition': {
      description: 'Nom du fichier à télécharger',
      schema: {
        type: 'string',
        example: 'attachment; filename="transactions_export_2025-12-06.xlsx"'
      }
    },
    'Content-Length': {
      description: 'Taille du fichier en octets',
      schema: {
        type: 'integer',
        example: 2457600
      }
    }
  }
})
@ApiResponse({
  status: 400,
  description: 'Export pas encore terminé',
  schema: {
    example: {
      success: false,
      message: 'Export pas encore terminé (statut: PROCESSING)'
    }
  }
})
@ApiResponse({
  status: 404,
  description: 'Job ou fichier introuvable',
  schema: {
    example: {
      success: false,
      message: 'Fichier d\'export introuvable'
    }
  }
})
@ApiResponse({
  status: 401,
  description: 'Non authentifié',
})
async downloadTransactionsExport(
  @Param('jobUuid') jobUuid: string,
  @Res() res: Response,
  @Request() req,
) {
  try {
    const { buffer, filename, mimeType } = await this.paymentService.downloadTransactionsExport(
      jobUuid,
      req.user.uuid,
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message
    });
  }
}

@Get('async-export/status/:jobId')
@ApiOperation({ summary: 'Vérifier le statut d\'un export' })
async getExportStatus(@Param('jobId') jobId: string) {
  return this.paymentService.getExportJobStatus(jobId);
}

@Get('async-exports/my-exports')
@ApiOperation({ summary: 'Liste de mes exports' })
async getMyExports(@Request() req) {
  return this.paymentService.getUserExports(req.user.uuid);
}


  @Put(':uuid')
  @ApiOperation({ summary: 'Modifier un paiement' })
  @ApiResponse({ status: 200, description: 'Paiement modifié avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs invalides.' })
  update(
    @Param('uuid') uuid: string,
    @Body() payload: UpdatePaymentDto,
    @Request() req,
  ) {
    return this.paymentService.update(uuid, payload, req.user.uuid);
  }


  @Put(':uuid/status')
  @ApiOperation({ summary: 'Modifier le statut d’un paiement' })
  @ApiParam({ name: 'uuid', description: 'UUID du paiement' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: Object.values(GlobalStatus),
          example: 'ENABLE',
        },
      },
    },
  })
  changeStatus(
    @Param('uuid') uuid: string,
    @Body('status') status: GlobalStatus,
    @Request() req,
  ) {
    return this.paymentService.changeStatus(uuid, status, req.user.uuid);
  }

  @Get('member/:member_uuid')
  @ApiOperation({ summary: 'Lister les paiements effectués pour un membre' })
  @ApiParam({ name: 'member_uuid', description: 'UUID du membre' })
  getByMember(@Param('member_uuid') member_uuid: string, @Request() req) {
    return this.paymentService.findByMember(member_uuid, req.user.uuid);
  }

  @Get('stats/global')
  @ApiOperation({ summary: 'Statistiques globales des paiements' })
  getStats(@Request() req) {
    return this.paymentService.getStats(req.user.uuid);
  }


  @Get('subgroups/:root_structure_uuid')
  @ApiQuery({
    name: 'source_uuid',
    required: true,
    example: 'e4bb675f-21c7-4af7-bd8e-c1d934c89e2e',
    description: "UUID de la campagne (donation ou abonnement)",
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 50 })
  @ApiQuery({ name: 'search', required: false, description: 'Recherche par nom ou prénom' })
  async findTransactionsForSubGroups(
    @Query('source_uuid') source_uuid: string,
    @Query('page') page = 1,
    @Query('limit') limit = 50,
    @Request() req,
    @Query('search') search?: string | undefined,
  ) {
    return this.paymentService.findTransactionsForSubGroups(
      source_uuid,
      req.user.uuid, // admin uuid
      +page,
      +limit,
      search,
    );
  }



/*   @Get('export/subgroups')
@ApiOperation({ summary: 'Exporter les transactions des sous-groupes en Excel' })
@ApiQuery({
  name: 'source_uuid',
  required: true,
  example: 'e4bb675f-21c7-4af7-bd8e-c1d934c89e2e',
  description: "UUID de la campagne (donation ou abonnement)",
})
@ApiQuery({
  name: 'status',
  required: false,
  enum: GlobalStatus,
  description: 'Filtrer par statut'
})
async exportTransactionsForSubGroups(
  @Query('source_uuid') source_uuid: string,
  @Query('status') status?: GlobalStatus,
  @Res() Res: Response,
  @Req() req?,
) {
  await this.paymentService.findTransactionsForSubGroupsExport(
    source_uuid,
    req.user.uuid,
    res,
    status,
  );
} */


}
