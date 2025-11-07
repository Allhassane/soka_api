import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { FormationService } from './formation.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateFormationDto } from './dto/create-formation.dto';
import { UpdateFormationDto } from './dto/update-formation.dto';

@ApiBearerAuth()
@ApiTags('Formations')
@Controller('formations')
@UseGuards(JwtAuthGuard)
export class FormationController {
  constructor(private readonly formationService: FormationService) {}

  @Get()
  @ApiOperation({ summary: 'Liste toutes les formations ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.formationService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une civilité ' })
  @ApiResponse({ status: 200, description: 'Formation créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateFormationDto, @Request() req) {
    return this.formationService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une civilité par UUID' })
  @ApiResponse({ status: 200, description: 'Formation trouvé.' })
  @ApiResponse({ status: 400, description: 'Formation non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.formationService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier une civilité' })
 @ApiResponse({ status: 200, description: 'Formation modifiée avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateFormationDto,
    ) {
    return this.formationService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une civilité' })
  @ApiResponse({ status: 200, description: 'Formation supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Fotmation introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.formationService.delete(uuid,admin_uuid);
  }
}
