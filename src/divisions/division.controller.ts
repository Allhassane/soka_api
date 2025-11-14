import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { DivisionService } from './division.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateDivisionDto } from './dto/create-division.dto';
import { UpdateDivisionDto } from './dto/update-division.dto';

@ApiBearerAuth()
@ApiTags('Division')
@Controller('division')
@UseGuards(JwtAuthGuard)
export class DivisionController {
  constructor(private readonly divisionService: DivisionService) {}

  @Get()
  @ApiOperation({ summary: 'Liste toutes les divisions' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.divisionService.findAll(admin_uuid);
  }

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau division' })
  @ApiResponse({ status: 200, description: 'Division créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateDivisionDto, @Request() req) {
    return this.divisionService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer un division par UUID' })
  @ApiResponse({ status: 200, description: 'Division trouvé.' })
  @ApiResponse({ status: 400, description: 'Division non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.divisionService.findOne(uuid, admin_uuid);
  }


  @Get('find-by/:department_uuid/gender/:gender')
  @ApiOperation({ summary: 'Récupérer une division par uuid du niveau' })
  @ApiResponse({ status: 200, description: 'Division trouvé.' })
  @ApiResponse({ status: 400, description: 'Division non trouvé.' })
  @ApiParam({ name: 'department_uuid', required: true })
  @ApiParam({ name: 'gender', required: true, enum: ['homme', 'femme'] })
  findByLevelAndCivility(
    @Param('department_uuid') department_uuid: string,
    @Param('gender') gender: string,
    @Request() req,
  ) {
    const admin_uuid = req.user.uuid as string;
    return this.divisionService.findByDepartmentAndCivility(
      department_uuid,
      gender,
      admin_uuid,
    );
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier un division' })
 @ApiResponse({ status: 200, description: 'Division modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateDivisionDto,
    ) {
    return this.divisionService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer une division' })
  @ApiResponse({ status: 200, description: 'Division supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Division introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.divisionService.delete(uuid,admin_uuid);
  }
}
