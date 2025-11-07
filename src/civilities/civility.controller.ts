import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CivilityService } from './civility.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateMaritalStatusDto } from './dto/create-civility.dto';
import { UpdateMaritalStatusDto } from './dto/update-civility.dto';

@ApiBearerAuth()
@ApiTags('Civilité')
@Controller('civilities')
@UseGuards(JwtAuthGuard)
export class CivilityController {
  constructor(private readonly civilityService: CivilityService) {}

  @Get()
  @ApiOperation({ summary: 'Liste toutes les civilités ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.civilityService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer une civilité ' })
  @ApiResponse({ status: 200, description: 'Civiilité créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateMaritalStatusDto, @Request() req) {
    return this.civilityService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer une civilité par UUID' })
  @ApiResponse({ status: 200, description: 'civilité trouvé.' })
  @ApiResponse({ status: 400, description: 'Civilité non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.civilityService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier une civilité' })
 @ApiResponse({ status: 200, description: 'CIvilité modifiée avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateMaritalStatusDto,
    ) {
    return this.civilityService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une civilité' })
  @ApiResponse({ status: 200, description: 'civilité supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'ciivilité introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.civilityService.delete(uuid,admin_uuid);
  }
}
