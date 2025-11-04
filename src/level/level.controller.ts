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
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PaginationQueryDto } from 'src/shared/dtos/pagination-query.dto';

@ApiBearerAuth()
@ApiTags('levels')
@UseGuards(JwtAuthGuard)
@Controller('levels')
export class LevelController {
  constructor(private readonly levelService: LevelService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un niveau' })
  @ApiResponse({ status: 201, description: 'Niveau créé avec succès.' })
  @ApiBody({ type: CreateLevelDto })
  create(@Body() dto: CreateLevelDto, @Request() req) {
    return this.levelService.create(dto, req.user.uuid as string);
  }

  @Get(':category')
  @ApiOperation({ summary: 'Lister les niveaux' })
  @ApiResponse({ status: 200, description: 'Liste des niveaux.' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiParam({
    name: 'category',
    description: 'Categorie',
    required: true,
    enum: ['geographic', 'pedagogic'],
  })
  findAll(
    @Param('category') category: string,
    @Query() query: PaginationQueryDto,
  ) {
    const { page = 1, limit = 10 } = query;
    return this.levelService.findAll(page, limit, category);
  }

  @Get(':uuid')
  @ApiOperation({ summary: 'Afficher un niveau' })
  @ApiParam({ name: 'uuid', description: 'UUID du niveau' })
  @ApiResponse({ status: 200, description: 'Détails du niveau.' })
  findOne(@Param('uuid') uuid: string, @Request() req) {
    return this.levelService.findOne(uuid, req.user.uuid as string);
  }

  @Put(':uuid/update')
  @ApiOperation({ summary: 'Modifier un niveau' })
  @ApiParam({ name: 'uuid', description: 'UUID du niveau à modifier' })
  @ApiBody({ type: UpdateLevelDto })
  update(
    @Param('uuid') uuid: string,
    @Body() dto: UpdateLevelDto,
    @Request() req,
  ) {
    return this.levelService.update(uuid, dto, req.user.uuid as string);
  }

  @Delete(':uuid/delete')
  @ApiOperation({ summary: 'Supprimer un niveau (soft delete)' })
  @ApiParam({ name: 'uuid', description: 'UUID du niveau à supprimer' })
  @ApiResponse({ status: 200, description: 'Niveau marqué comme supprimé.' })
  delete(@Param('uuid') uuid: string, @Request() req) {
    return this.levelService.delete(uuid, req.user.uuid as string);
  }

}
