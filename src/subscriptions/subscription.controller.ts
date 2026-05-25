import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam, ApiBody } from '@nestjs/swagger';
import { SubscriptionService } from './subscription.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

@ApiBearerAuth()
@ApiTags('Abonnement')
@Controller('subscriptions')
@UseGuards(JwtAuthGuard)
export class SubscriptionController {
  constructor(private readonly subscriptionService: SubscriptionService) {}

  @Get()
  @ApiOperation({ summary: 'Liste toutes les abonnements ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.subscriptionService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un abonnement ' })
  @ApiResponse({ status: 200, description: 'Métier créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateSubscriptionDto, @Request() req) {
    return this.subscriptionService.store(payload, req.user.uuid as string);
  }

  @Get('findOneByUuid:uuid')
  @ApiOperation({ summary: 'Récupérer une abonnement par UUID' })
  @ApiResponse({ status: 200, description: 'Abonnement trouvé.' })
  @ApiResponse({ status: 400, description: 'Abonnement non trouvé.' })
  findOneByUuid(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.subscriptionService.findOneByUuid(uuid, admin_uuid);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une abonnement par UUID' })
  @ApiResponse({ status: 200, description: 'Abonnement trouvé.' })
  @ApiResponse({ status: 400, description: 'Abonnement non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.subscriptionService.findOne( uuid,
      req.user.uuid,
      req.user.member_uuid,
      req.user.responsibilities[0]?.structure?.uuid,);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier un abonnement' })
 @ApiResponse({ status: 200, description: 'Abonnement modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateSubscriptionDto,
    ) {
    return this.subscriptionService.update(uuid, payload,req.user.uuid);
 }


@Put(':uuid/status')
@ApiOperation({ summary: 'Changer le statut d’un abonnement' })
@ApiParam({ name: 'uuid', description: 'UUID de l’abonnement à modifier' })
@ApiBody({
  schema: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        enum: Object.values(GlobalStatus),
        example: 'STARTED',
      },
    },
    required: ['status'],
  },
})
@ApiResponse({ status: 200, description: 'Statut modifié avec succès.' })
@ApiResponse({ status: 400, description: 'Statut invalide ou non autorisé.' })
@ApiResponse({ status: 404, description: 'Abonnement introuvable ou administrateur invalide.' })
async changeStatus(
  @Param('uuid') uuid: string,
  @Body('status') status: GlobalStatus,
  @Request() req,
) {
  return this.subscriptionService.changeStatus(uuid, status, req.user.uuid);
}

  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer un abonnement' })
  @ApiResponse({ status: 200, description: 'Abonnement supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Abonnement introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.subscriptionService.delete(uuid,admin_uuid);
  }
}
