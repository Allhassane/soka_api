import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ResponsabilityService } from './reponsability.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateResponsabilityDto } from './dto/create-responsability.dto';
import { UpdateResponsabilityDto } from './dto/update-responsability.dto';

@ApiBearerAuth()
@ApiTags('Responsabilité')
@Controller('responsabilities')
@UseGuards(JwtAuthGuard)
export class ResponsabilityController {
  constructor(private readonly responsabilityService: ResponsabilityService) {}

  @Get()
  @ApiOperation({ summary: 'Liste de toutes les reponsabilités ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.responsabilityService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une reponsabilité ' })
  @ApiResponse({ status: 200, description: 'reponsabilité créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateResponsabilityDto, @Request() req) {
    return this.responsabilityService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une reponsabilité par UUID' })
  @ApiResponse({ status: 200, description: 'reponsabilité trouvé.' })
  @ApiResponse({ status: 400, description: 'reponsabilité non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.responsabilityService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier une responsabilité' })
 @ApiResponse({ status: 200, description: 'Localité modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateResponsabilityDto,
    ) {
    return this.responsabilityService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une responsabilité' })
  @ApiResponse({ status: 200, description: 'Responsabilité supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Responsabilité introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.responsabilityService.delete(uuid,admin_uuid);
  }
}
