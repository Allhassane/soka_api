import { Body, Controller, Delete, Get, Param, Post, Put, Request } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { DonateService } from './donate.service';
import { CreateDonateDto } from './dto/create-donate.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

@ApiTags('Don')
@Controller('donate')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class DonateController {
  constructor(private readonly donateService: DonateService) {}

  @Get()
  @ApiOperation({ summary: 'Liste de toutes les dons' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  @ApiResponse({ status: 400, description: 'Liste non récupérée.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.donateService.findAll(admin_uuid);
  }
  
  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une don par UUID' })
  @ApiResponse({ status: 200, description: 'Don trouvé.' })
  @ApiResponse({ status: 400, description: 'Don non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.donateService.findOne(uuid, admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Liste de toutes les dons' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  @ApiResponse({ status: 400, description: 'Liste non récupérée.' })
  create(@Body() createDonateDto: CreateDonateDto, @Request() req) {
    console.log(createDonateDto);
    const admin_uuid = req.user.uuid as string;
    return this.donateService.create(createDonateDto, admin_uuid);
  }
   
  @Put(':uuid/status')
  @ApiOperation({ summary: 'Changer le statut d’un don' })
  @ApiParam({ name: 'uuid', description: 'UUID du don à modifier' })
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
  @ApiResponse({ status: 404, description: 'Don introuvable ou administrateur invalide.' })
  async changeStatus(
    @Param('uuid') uuid: string,
    @Body('status') status: GlobalStatus,
    @Request() req,
  ) {
    return this.donateService.changeStatus(uuid, status, req.user.uuid);
  }

  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer un don' })
  @ApiResponse({ status: 200, description: 'Don supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Don introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.donateService.delete(uuid,admin_uuid);
  }
}
