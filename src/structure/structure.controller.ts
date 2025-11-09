import {
  Controller,
  Post,
  Body,
  Get,
  Put,
  Delete,
  Param,
  UseGuards,
  Query,
} from '@nestjs/common';
import { CreateStructureDto } from './dto/create-structure.dto';
import { StructureService } from './structure.service';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { UpdateStructureDto } from './dto/update-structure.dto';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';

@ApiTags('Structures')
@Controller('structure')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class StructureController {
  constructor(private readonly structureService: StructureService) {}

  @Get()
  @ApiOperation({
    summary: 'Liste de toutes les structures',
  })
  @ApiResponse({
    status: 200,
    description: 'Liste des agents récupérée avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  public findAll() {
    return this.structureService.findAll();
  }

  @Post()
  @ApiOperation({
    summary: 'Ajouter une structure',
  })
  @ApiResponse({
    status: 201,
    description: 'Insertion effectuée avec succès',
  })
  @ApiResponse({
    status: 400,
    description: 'Requête invalide - Données manquantes ou incorrectes',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  public create(@Body() createStructureDto: CreateStructureDto) {
    return this.structureService.create(createStructureDto);
  }

  @Get('migration')
  @ApiOperation({
    summary: 'Migration des structures',
  })
  @ApiResponse({
    status: 200,
    description: 'Migration effectuée avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  public migration() {
    return this.structureService.migration();
  }

  @Get(':uuid')
  @ApiOperation({
    summary: 'Recupérer une structure',
  })
  @ApiResponse({
    status: 200,
    description: 'Structure récupérée avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  public findOne(@Param('uuid') uuid: string) {
    return this.structureService.findOne(uuid);
  }

  @Get('childrens/:uuid')
  @ApiOperation({
    summary: "Recupérer les enfants d'une structure",
  })
  @ApiResponse({
    status: 200,
    description: 'Enfants récupérés avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  @ApiQuery({
    name: 'uuid',
    description: 'UUID de la structure',
    required: false,
  })
  public findChildrens(@Query('uuid') uuid: string | undefined) {
    return this.structureService.findChildrens(uuid);
  }

  @Get('by-childrens/:uuid')
  @ApiOperation({
    summary: "Recupérer les enfants d'une structure",
  })
  @ApiResponse({
    status: 200,
    description: 'Enfants récupérés avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  @ApiQuery({
    name: 'uuid',
    description: 'UUID de la structure',
    required: false,
  })
  public findByChildrens(@Query('uuid') uuid: string | undefined) {
    return this.structureService.findByChildrens(uuid);
  }

  @Get('find-by-level/:level_uuid')
  @ApiOperation({
    summary: "Recupérer les structures d'un niveau",
  })
  @ApiResponse({
    status: 200,
    description: 'Structures récupérées avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  public findByLevel(@Param('level_uuid') level_uuid: string) {
    return this.structureService.findByLevel(level_uuid);
  }

  @Get('find-organisation/:uuid')
  @ApiOperation({
    summary: "Recupérer les structures d'une organisation",
  })
  @ApiResponse({
    status: 200,
    description: 'Structures récupérées avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  public findByOrganisation(@Param('uuid') uuid: string) {
    return this.structureService.findByOrganisation(uuid);
  }

  @Put(':uuid')
  @ApiOperation({
    summary: 'Modifier une structure',
  })
  @ApiResponse({
    status: 200,
    description: 'Structure modifiée avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  @ApiBody({ type: UpdateStructureDto })
  @ApiParam({
    name: 'uuid',
    description: 'UUID de la structure',
    required: true,
  })
  public update(
    @Param('uuid') uuid: string,
    @Body() updateStructureDto: UpdateStructureDto,
  ) {
    return this.structureService.update(uuid, updateStructureDto);
  }

  @Delete(':uuid')
  @ApiOperation({
    summary: 'Supprimer une structure',
  })
  @ApiResponse({
    status: 200,
    description: 'Structure supprimée avec succès',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  public delete(@Param('uuid') uuid: string) {
    return this.structureService.delete(uuid);
  }
}
