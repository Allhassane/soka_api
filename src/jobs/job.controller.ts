import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JobService } from './job.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiBearerAuth()
@ApiTags('Métiers')
@Controller('jobs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JobController {
  constructor(private readonly jobService: JobService) {}

  @Get()
  @RequirePermissions('metiers_voir')
  @ApiOperation({ summary: 'Liste toutes les métiers ' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll(@Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.jobService.findAll(admin_uuid);
  }

  @Post()
  @RequirePermissions('metiers_creer')
  @ApiOperation({ summary: 'Créer un métier ' })
  @ApiResponse({ status: 200, description: 'Métier créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateJobDto, @Request() req) {
    return this.jobService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @RequirePermissions('metiers_voir')
  @ApiOperation({ summary: 'Récupérer une métier par UUID' })
  @ApiResponse({ status: 200, description: 'Métier trouvé.' })
  @ApiResponse({ status: 400, description: 'Metier non trouvé.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.jobService.findOne(uuid, admin_uuid);
  }

 @Put(':uuid')
 @RequirePermissions('metiers_modifier')
 @ApiOperation({ summary: 'Modifier un métier' })
 @ApiResponse({ status: 200, description: 'Métier modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateJobDto,
    ) {
    return this.jobService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @RequirePermissions('metiers_supprimer')
  @ApiOperation({ summary: 'Supprimer un métier' })
  @ApiResponse({ status: 200, description: 'Métier supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Métier introuvable.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    const admin_uuid = req.user.uuid as string;
    return this.jobService.delete(uuid,admin_uuid);
  }
}
