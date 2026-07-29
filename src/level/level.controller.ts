import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Put,
  Query,
} from '@nestjs/common';
import { LevelService } from './level.service';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { LevelPaginationQueryDto } from './dto/level-pagination-query.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';

@ApiBearerAuth()
@ApiTags('Niveaux')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('levels')
export class LevelController {
  constructor(private readonly levelService: LevelService) {}

  @Get()
  @RequirePermissions('niveaux_voir')
  @ApiOperation({ summary: 'Lister tous les niveaux' })
  @ApiResponse({ status: 200, description: 'Retour paginé' })
  findAllLevels(@Query() query: LevelPaginationQueryDto) {
    const { page, limit, search } = query;
    return this.levelService.findAll('all', page, limit, search);
  }

  @Post()
  @RequirePermissions('niveaux_creer')
  @ApiOperation({ summary: 'Créer un niveau' })
  @ApiResponse({ status: 201, description: 'Niveau créé avec succès.' })
  @ApiBody({ type: CreateLevelDto })
  create(@Body() dto: CreateLevelDto) {
    return this.levelService.create(dto);
  }

  @Get('find-by-category/:category')
  @RequirePermissions('niveaux_voir')
  @ApiOperation({ summary: 'Lister les niveaux' })
  @ApiResponse({ status: 200, description: 'Liste des niveaux.' })
  @ApiParam({
    name: 'category',
    description: 'Categorie',
    required: true,
    enum: ['all', 'responsibility', 'level'],
  })
  findAll(@Param('category') category: string) {
    return this.levelService.findAll(category);
  }

  @Get(':uuid')
  @RequirePermissions('niveaux_voir')
  @ApiOperation({ summary: 'Afficher un niveau' })
  @ApiParam({ name: 'uuid', description: 'UUID du niveau' })
  @ApiResponse({ status: 200, description: 'Détails du niveau.' })
  findOne(@Param('uuid') uuid: string) {
    return this.levelService.findOne(uuid);
  }

  @Put('update/:uuid')
  @RequirePermissions('niveaux_modifier')
  @ApiOperation({ summary: 'Modifier un niveau' })
  @ApiParam({ name: 'uuid', description: 'UUID du niveau à modifier' })
  @ApiBody({ type: UpdateLevelDto })
  update(@Param('uuid') uuid: string, @Body() dto: UpdateLevelDto) {
    return this.levelService.update(uuid, dto);
  }

  @Delete('delete/:uuid')
  @RequirePermissions('niveaux_supprimer')
  @ApiOperation({ summary: 'Supprimer un niveau (soft delete)' })
  @ApiParam({ name: 'uuid', description: 'UUID du niveau à supprimer' })
  @ApiResponse({ status: 200, description: 'Niveau marqué comme supprimé.' })
  delete(@Param('uuid') uuid: string) {
    return this.levelService.delete(uuid);
  }
}
