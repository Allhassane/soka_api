import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CommitteeService } from './committee.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateCommitteeDto } from './dto/create-committe.dto';
import { UpdateCommitteeDto } from './dto/update-committe.dto';

@ApiBearerAuth()
@ApiTags('Comite')
@Controller('comite')
@UseGuards(JwtAuthGuard)
export class CommitteeController {
  constructor(private readonly committeeService: CommitteeService) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les comités' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.committeeService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau comité' })
  @ApiResponse({ status: 200, description: 'Comité créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateCommitteeDto, @Request() req) {
    return this.committeeService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer un comité par UUID' })
  @ApiResponse({ status: 200, description: 'Comité trouvé.' })
  @ApiResponse({ status: 400, description: 'Comité non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.committeeService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier un comité' })
 @ApiResponse({ status: 200, description: 'Comité modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateCommitteeDto,
    ) {
    return this.committeeService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer un comité' })
  @ApiResponse({ status: 200, description: 'Comité supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Comité introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.committeeService.delete(uuid,admin_uuid);
  }
}
