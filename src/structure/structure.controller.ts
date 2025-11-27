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
  Req,
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
import { StructureTreeService } from './structure-tree.service';
import { StructureTreeNodeDto } from './dto/tree.dto';

@ApiTags('Structures')
@Controller('structure')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class StructureController {
  constructor(private readonly structureService: StructureService,
    private readonly structureTreeService:StructureTreeService,
  ) {}

    @Get('my-members')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
      summary: 'Récupérer les membres accessibles par l\'utilisateur connecté avec leur structure_tree',
    })
    @ApiQuery({ name: 'page', required: false, type: Number })
    @ApiQuery({ name: 'limit', required: false, type: Number })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'gender', required: false, enum: ['homme', 'femme'] })
    @ApiQuery({ name: 'has_gohonzon', required: false, type: Boolean })
    @ApiQuery({ name: 'department_uuid', required: false, type: String })
    @ApiQuery({ name: 'division_uuid', required: false, type: String })
    async getMyMembers(
      @Req() req,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('search') search?: string,
      @Query('gender') gender?: 'homme' | 'femme',
      @Query('has_gohonzon') has_gohonzon?: boolean,
      @Query('department_uuid') department_uuid?: string,
      @Query('division_uuid') division_uuid?: string,
    ) {
      const user = req.user;
      //console.log(user.responsibilities[0].structure)
      return this.structureTreeService.getMembersWithTreeByConnectedUser(
        user.member_uuid,
        user.responsibilities[0]?.structure?.uuid,
        {
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          search,
          gender,
          has_gohonzon,
          department_uuid,
          division_uuid,
        }
      );
    }

    @Get('my-beneficiary')
    @UseGuards(JwtAuthGuard)
    @ApiOperation({
      summary: 'Récupérer tous les membres accessibles par l\'utilisateur connecté (bénéficiaires)',
    })
    @ApiQuery({ name: 'search', required: false, type: String })
    @ApiQuery({ name: 'gender', required: false, enum: ['homme', 'femme'] })
    @ApiQuery({ name: 'has_gohonzon', required: false, type: Boolean })
    @ApiQuery({ name: 'department_uuid', required: false, type: String })
    @ApiQuery({ name: 'division_uuid', required: false, type: String })
    async getMyBeneficiary(
      @Req() req,
      @Query('search') search?: string,
      @Query('gender') gender?: 'homme' | 'femme',
      @Query('has_gohonzon') has_gohonzon?: boolean,
      @Query('department_uuid') department_uuid?: string,
      @Query('division_uuid') division_uuid?: string,
    ) {
      const user = req.user;
      return this.structureTreeService.getBeneficiaryByConnectedUser(
        user.member_uuid,
        user.responsibilities[0]?.structure?.uuid,
        {
          search,
          gender,
          has_gohonzon,
          department_uuid,
          division_uuid,
        }
      );
    }

  @Get('my-stats')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Récupérer les statistiques basées sur la structure du membre connecté',
  })
  @ApiQuery({ name: 'region_uuid', required: false, type: String })
  @ApiQuery({ name: 'centre_uuid', required: false, type: String })
  @ApiQuery({ name: 'chapitre_uuid', required: false, type: String })
  @ApiQuery({ name: 'district_uuid', required: false, type: String })
  @ApiQuery({ name: 'groupe_uuid', required: false, type: String })
  @ApiQuery({ name: 'department_uuid', required: false, type: String })
  @ApiQuery({ name: 'division_uuid', required: false, type: String })
  async getMyStats(
    @Req() req,
    @Query('region_uuid') region_uuid?: string,
    @Query('centre_uuid') centre_uuid?: string,
    @Query('chapitre_uuid') chapitre_uuid?: string,
    @Query('district_uuid') district_uuid?: string,
    @Query('groupe_uuid') groupe_uuid?: string,
    @Query('department_uuid') department_uuid?: string,
    @Query('division_uuid') division_uuid?: string,
  ) {
    const user = req.user;
    const responsibility_structure_uuid = user.responsibilities[0]?.structure?.uuid;
    //console.log(user)
    return this.structureTreeService.getMemberStatsByConnectedUser(
      user.member_uuid,
      responsibility_structure_uuid,
      {
        region_uuid,
        centre_uuid,
        chapitre_uuid,
        district_uuid,
        groupe_uuid,
        department_uuid,
        division_uuid,
      }
    );
  }

  @Get('tree')
  @ApiOperation({
    summary: 'Récupérer l\'arbre des structures avec comptage des membres',
    description: `
      Retourne l'arbre hiérarchique complet des structures (NATIONAL → REGION → CENTRE → GROUPE → SOUS-GROUPE)
      avec pour chaque nœud :
      - Le nombre de membres directs
      - Le nombre total de membres (cumulatif incluant tous les sous-groupes)
      - La liste des UUIDs de tous les sous-groupes
      - Les enfants imbriqués
    `,
  })
  @ApiQuery({
    name: 'root_uuid',
    required: false,
    type: String,
    description: 'UUID de la structure racine pour filtrer l\'arbre (optionnel)',
  })
  @ApiResponse({
    status: 200,
    description: 'Arbre des structures avec comptages',
    type: [StructureTreeNodeDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  async getTree(@Query('root_uuid') rootUuid?: string) {

    return this.structureTreeService.getStructureTreeWithCounts(rootUuid);
  }

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


  @Get('by-all-childrens/:uuid')
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
    required: true,
  })
  public findByAllChildrens(@Query('uuid') uuid: string) {
    return this.structureService.findByAllChildrens(uuid);
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



  @Get('members/:uuid')
  @ApiOperation({
    summary: 'Récupérer tous les membres d\'une structure avec statistiques et pagination',
  })
  @ApiParam({
    name: 'uuid',
    type: String,
    description: 'UUID de la structure',
  })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Numéro de page', example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Nombre d\'éléments par page', example: 50 })
  @ApiQuery({ name: 'search', required: false, type: String, description: 'Recherche par nom, matricule, téléphone ou email' })
  @ApiQuery({ name: 'gender', required: false, enum: ['homme', 'femme'], description: 'Filtrer par genre' })
  @ApiQuery({ name: 'has_gohonzon', required: false, type: Boolean, description: 'Filtrer par possession de gohonzon' })
  @ApiQuery({ name: 'department_uuid', required: false, type: String, description: 'Filtrer par département' })
  @ApiQuery({ name: 'division_uuid', required: false, type: String, description: 'Filtrer par division' })
  @ApiResponse({
    status: 200,
    description: 'Membres et statistiques de la structure',
  })
  async getStructureMembersWithStats(
    @Param('uuid') uuid: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('gender') gender?: 'homme' | 'femme',
    @Query('has_gohonzon') has_gohonzon?: boolean,
    @Query('department_uuid') department_uuid?: string,
    @Query('division_uuid') division_uuid?: string,
  ) {
    return this.structureTreeService.getStructureMembersWithStats(uuid, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search,
      gender,
      has_gohonzon,
      department_uuid,
      division_uuid,
    });
  }




}
