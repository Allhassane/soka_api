import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ModuleService } from './module.service';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';

@ApiBearerAuth()
@ApiTags('Modules')
@Controller('modules')
@UseGuards(JwtAuthGuard)
export class ModuleController {
  constructor(private readonly moduleService: ModuleService) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les modules' })
  @ApiResponse({ status: 200, description: 'Liste récupérée avec succès.' })
  findAll() {
    return this.moduleService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau module' })
  @ApiResponse({ status: 200, description: 'Module créé avec succès.' })
  @ApiResponse({ status: 400, description: 'Champs requis manquants.' })
  store(@Body() payload: CreateModuleDto, @Request() req) {
    return this.moduleService.store(payload, req.user.uuid as string);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Récupérer un module par UUID' })
  @ApiResponse({ status: 200, description: 'Module trouvé.' })
  @ApiResponse({ status: 400, description: 'Module non trouvé.' })
  findOne(@Param('uuid') uuid: string) {
    return this.moduleService.findOne(uuid);
  }

 @Put(':uuid')
 @ApiOperation({ summary: 'Modifier un module' })
 @ApiResponse({ status: 200, description: 'Module modifié avec succès.' })
 @ApiResponse({ status: 400, description: 'Champs invalides ou manquants.' })
 update(
 @Param('uuid') uuid: string,
 @Request() req,
 @Body() payload: UpdateModuleDto,
    ) {
    return this.moduleService.update(uuid, payload,req.user.uuid);
 }


  @Delete(':uuid')
  @ApiOperation({ summary: 'Supprimer un module' })
  @ApiResponse({ status: 200, description: 'Module supprimé avec succès.' })
  @ApiResponse({ status: 400, description: 'Module introuvable.' })
  delete(@Param('uuid') uuid: string) {
    return this.moduleService.delete(uuid);
  }
}
