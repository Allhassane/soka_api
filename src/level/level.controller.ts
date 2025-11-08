import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Request,
  Put,
  Query,
} from '@nestjs/common';
import { LevelService } from './level.service';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { JwtAuthGuard } from '../auth/guards/auth.guard';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';

// @ApiBearerAuth()
@ApiTags('Niveaux')
// @UseGuards(JwtAuthGuard)
@Controller('levels')
export class LevelController {
  constructor(private readonly levelService: LevelService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un niveau' })
  @ApiResponse({ status: 201, description: 'Niveau créé avec succès.' })
  @ApiBody({ type: CreateLevelDto })
  create(@Body() dto: CreateLevelDto) {
    return this.levelService.create(dto);
  }

  @Get('find-by-category/:category')
  @ApiOperation({ summary: 'Lister les niveaux' })
  @ApiResponse({ status: 200, description: 'Liste des niveaux.' })
  @ApiParam({
    name: 'category',
    description: 'Categorie',
    required: true,
    enum: ['all', 'responsibility', 'mixte'],
  })
  findAll(@Param('category') category: string) {
    return this.levelService.findAll(category);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Afficher un niveau' })
  @ApiParam({ name: 'uuid', description: 'UUID du niveau' })
  @ApiResponse({ status: 200, description: 'Détails du niveau.' })
  findOne(@Param('uuid') uuid: string) {
    return this.levelService.findOne(uuid);
  }

  @Put('update/:uuid')
  @ApiOperation({ summary: 'Modifier un niveau' })
  @ApiParam({ name: 'uuid', description: 'UUID du niveau à modifier' })
  @ApiBody({ type: UpdateLevelDto })
  update(@Param('uuid') uuid: string, @Body() dto: UpdateLevelDto) {
    return this.levelService.update(uuid, dto);
  }

  @Delete('delete/:uuid')
  @ApiOperation({ summary: 'Supprimer un niveau (soft delete)' })
  @ApiParam({ name: 'uuid', description: 'UUID du niveau à supprimer' })
  @ApiResponse({ status: 200, description: 'Niveau marqué comme supprimé.' })
  delete(@Param('uuid') uuid: string) {
    return this.levelService.delete(uuid);
  }
}
