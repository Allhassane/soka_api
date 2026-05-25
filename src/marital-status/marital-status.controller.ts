import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MaritalStatusService } from './marital-status.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateMaritalStatusDto } from './dto/create-marital-status.dto';
import { UpdateMaritalStatusDto } from './dto/update-marital-status.dto';

@ApiBearerAuth()
@ApiTags('Situation Matrimoniale')
@Controller('marital-status')
@UseGuards(JwtAuthGuard)
export class MaritalStatusController {
  constructor(private readonly maritalStatusService: MaritalStatusService) {}

  @Get()
  @ApiOperation({ summary: 'Liste toutes les situations matrimoniale' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.maritalStatusService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau division' })
  @ApiResponse({ status: 200, description: 'Situation matrimoniale créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateMaritalStatusDto, @Request() req) {
    return this.maritalStatusService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une situation matrimoniale par UUID' })
  @ApiResponse({ status: 200, description: 'Situation matrimoniale trouvé.' })
  @ApiResponse({ status: 400, description: 'Situation matrimoniale non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.maritalStatusService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier une situation matrimoniale' })
 @ApiResponse({ status: 200, description: 'situation matrimoniale modifiée avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateMaritalStatusDto,
    ) {
    return this.maritalStatusService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une situation matrimoniale' })
  @ApiResponse({ status: 200, description: 'situation matrimoniale supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'situation matrimoniale introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.maritalStatusService.delete(uuid,admin_uuid);
  }
}
