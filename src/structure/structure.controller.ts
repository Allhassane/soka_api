import { allowedRootUuidsFromJwt } from 'src/access-scope/perimeter-from-jwt';
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
  Res,
  Request,
} from '@nestjs/common';
import { CreateStructureDto } from './dto/create-structure.dto';
import { StructureService } from './structure.service';
import { Response } from 'express';
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
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { MemberStatsFilters, PaginationMemberParams, StructureTreeService } from './structure-tree.service';
import { StructureTreeNodeDto } from './dto/tree.dto';
import { StructurePaginationQueryDto } from './dto/structure-pagination-query.dto';

@ApiTags('Structures')
@Controller('structure')
@ApiBearerAuth()
// PermissionsGuard ajouté au niveau classe (comme MemberController) : les routes sans
// @RequirePermissions restent « laissées passer » (cf. PermissionsGuard) - non-régressif.
// L'autorisation effective des endpoints stats/export est posée par @RequirePermissions.
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StructureController {
  constructor(private readonly structureService: StructureService,
    private readonly structureTreeService:StructureTreeService,
  ) {}

  /**
   * Dérive le PÉRIMÈTRE d'autorisation à partir du JWT (`req.user`). À ne pas confondre
   * avec l'ACCÈS (qui est géré par `PermissionsGuard` + `@RequirePermissions`) :
   * - isAdmin : flag runtime `is_admin` - c'est le SEUL bypass « voit tout », aligné sur
   *   `PermissionsGuard` (et le seed RBAC : ADMINISTRATEUR = piloté par `is_admin`).
   * - allowedRootUuids : structures de TOUTES les responsabilités (union des périmètres),
   *   pour ne pas restreindre à tort un responsable multi-structures.
   */
  private buildPerimeter(req): { isAdmin: boolean; allowedRootUuids: string[] } {
    const user = req?.user ?? {};
    return {
      isAdmin: user.is_admin === true,
      // Racine unique issue du token : couvre responsabilités ET comités (cf. helper).
      allowedRootUuids: allowedRootUuidsFromJwt(user),
    };
  }

  /**
   * À appeler dans TOUTE route qui reçoit un uuid de structure fourni par l'appelant.
   * `@RequirePermissions` accorde le droit d'utiliser la fonction ; ceci borne les DONNÉES.
   * Sans lui, changer l'uuid dans l'URL suffit à lire tout l'arbre (fuite constatée le
   * 2026-07-25 sur `GET /structure/members/:uuid`).
   */
  private async assertDansPerimetre(req, structureUuid?: string): Promise<void> {
    if (!structureUuid) return;
    await this.structureTreeService.assertStructureWithinPerimeter(
      structureUuid,
      this.buildPerimeter(req),
    );
  }

    @Get('my-members')
    @RequirePermissions('structures_voir')
    @UseGuards(JwtAuthGuard, PermissionsGuard)
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
    @ApiQuery({ name: 'structure_uuid', required: false, type: String })
    async getMyMembers(
      @Req() req,
      @Query('page') page?: number,
      @Query('limit') limit?: number,
      @Query('search') search?: string,
      @Query('gender') gender?: 'homme' | 'femme',
      @Query('has_gohonzon') has_gohonzon?: boolean,
      @Query('department_uuid') department_uuid?: string,
      @Query('division_uuid') division_uuid?: string,
      @Query('structure_uuid') structure_uuid?: string,
    ) {
      const user = req.user;
      // Racine du périmètre issue du token : couvre responsabilités ET comités.
      // (Avant : `responsibilities[0].structure.uuid`, qui ignorait les comités ET dépendait
      // de l'ordre indéterminé du tableau quand le membre porte plusieurs responsabilités.)
      return this.structureTreeService.getMembersWithTreeByConnectedUser(
        user.member_uuid,
        allowedRootUuidsFromJwt(user)[0],
        {
          page: page ? Number(page) : undefined,
          limit: limit ? Number(limit) : undefined,
          search,
          gender,
          has_gohonzon,
          department_uuid,
          division_uuid,
          structure_uuid,
        }
      );
    }


/*
@Get('export/my-members/excel')
@ApiOperation({ summary: 'Exporter les membres en Excel' })
@ApiQuery({ name: 'search', required: false })
@ApiQuery({ name: 'gender', required: false, enum: ['homme', 'femme'] })
@ApiQuery({ name: 'has_gohonzon', required: false, type: Boolean })
@ApiQuery({ name: 'region_uuid', required: false, type: String })
@ApiQuery({ name: 'centre_uuid', required: false, type: String })
@ApiQuery({ name: 'chapitre_uuid', required: false, type: String })
@ApiQuery({ name: 'district_uuid', required: false, type: String })
@ApiQuery({ name: 'groupe_uuid', required: false, type: String })
@ApiQuery({ name: 'department_uuid', required: false })
@ApiQuery({ name: 'division_uuid', required: false })
async exportMembersToExcel(
  @Res() Res: Response,
  @Req() req?,
  @Query('search') search?: string,
  @Query('gender') gender?: 'homme' | 'femme',
  @Query('has_gohonzon') has_gohonzon?: boolean,
  @Query('region_uuid') region_uuid?: string,
  @Query('centre_uuid') centre_uuid?: string,
  @Query('chapitre_uuid') chapitre_uuid?: string,
  @Query('district_uuid') district_uuid?: string,
  @Query('groupe_uuid') groupe_uuid?: string,
  @Query('department_uuid') department_uuid?: string,
  @Query('division_uuid') division_uuid?: string,
): Promise<void> {
  const filterParams = {
    search,
    gender,
    has_gohonzon,
    region_uuid,
    centre_uuid,
    chapitre_uuid,
    district_uuid,
    groupe_uuid,
    department_uuid,
    division_uuid,
  };
   const user = req.user;
  await this.structureTreeService.exportMembersToExcel(
    user.member_uuid,
    user.responsibilities?.[0]?.structure?.uuid,
    Res,
    filterParams
  );
}
*/

/* ######################## */


@Get('export/my-members/excel')
@RequirePermissions('exports_voir_menu_exports')
@ApiOperation({ summary: 'Lancer l\'export des membres en arrière-plan' })
@ApiQuery({ name: 'search', required: false })
@ApiQuery({ name: 'gender', required: false, enum: ['homme', 'femme'] })
@ApiQuery({ name: 'has_gohonzon', required: false, type: Boolean })
@ApiQuery({ name: 'region_uuid', required: false, type: String })
@ApiQuery({ name: 'centre_uuid', required: false, type: String })
@ApiQuery({ name: 'chapitre_uuid', required: false, type: String })
@ApiQuery({ name: 'district_uuid', required: false, type: String })
@ApiQuery({ name: 'groupe_uuid', required: false, type: String })
@ApiQuery({ name: 'department_uuid', required: false })
@ApiQuery({ name: 'division_uuid', required: false })
async queueMembersExport(
  @Req() req,
  @Query('search') search?: string,
  @Query('gender') gender?: 'homme' | 'femme',
  @Query('has_gohonzon') has_gohonzon?: boolean,
  @Query('region_uuid') region_uuid?: string,
  @Query('centre_regional_uuid') centre_regional_uuid?: string,
  @Query('centre_uuid') centre_uuid?: string,
  @Query('chapitre_uuid') chapitre_uuid?: string,
  @Query('district_uuid') district_uuid?: string,
  @Query('groupe_uuid') groupe_uuid?: string,
  @Query('sous_groupe_uuid') sous_groupe_uuid?: string,
  @Query('department_uuid') department_uuid?: string,
  @Query('division_uuid') division_uuid?: string,
) {
  const filterParams = {
    search,
    gender,
    has_gohonzon,
    region_uuid,
    centre_regional_uuid,
    centre_uuid,
    chapitre_uuid,
    district_uuid,
    groupe_uuid,
    sous_groupe_uuid,
    department_uuid,
    division_uuid,
  };

  const user = req.user;

  return this.structureTreeService.queueMembersExport(
    user.member_uuid,
    user.responsibilities?.[0]?.structure?.uuid,
    filterParams,
    user.uuid,
    this.buildPerimeter(req),
  );
}

@Get('async-export/status/:jobId')
@RequirePermissions('structures_voir')
@ApiOperation({ summary: 'Vérifier le statut d\'un export de membres' })
async getExportStatus(@Param('jobId') jobId: string) {
  return this.structureTreeService.getExportJobStatus(jobId);
}

@Get('async-exports/download/:jobUuid')
@RequirePermissions('structures_voir')
@ApiOperation({ summary: 'Télécharger un export de membres terminé' })
async downloadMembersExport(
  @Param('jobUuid') jobUuid: string,
  @Res() res: Response,
  @Req() req,
) {
  try {
    const { buffer, filename, mimeType } = await this.structureTreeService.downloadMembersExport(
      jobUuid,
      req.user.uuid,
    );

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buffer.length);
    res.send(buffer);
  } catch (error) {
    res.status(error.status || 500).json({
      success: false,
      message: error.message
    });
  }
}

    @Get('my-beneficiary')
    @RequirePermissions('structures_voir')
    @UseGuards(JwtAuthGuard, PermissionsGuard)
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
        user.responsibilities?.[0]?.structure?.uuid,
        user.responsibilities?.[0]?.level_uuid,

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
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('dashboard_voir_menu_dashboard')
  @ApiOperation({
    summary: 'Récupérer les statistiques basées sur la structure du membre connecté',
  })
  @ApiQuery({ name: 'region_uuid', required: false, type: String })
  @ApiQuery({ name: 'centre_regional_uuid', required: false, type: String })
  @ApiQuery({ name: 'centre_uuid', required: false, type: String })
  @ApiQuery({ name: 'chapitre_uuid', required: false, type: String })
  @ApiQuery({ name: 'district_uuid', required: false, type: String })
  @ApiQuery({ name: 'groupe_uuid', required: false, type: String })
  @ApiQuery({ name: 'sous_groupe_uuid', required: false, type: String })
  @ApiQuery({ name: 'department_uuid', required: false, type: String })
  @ApiQuery({ name: 'division_uuid', required: false, type: String })
  async getMyStats(
    @Req() req,
    @Query('region_uuid') region_uuid?: string,
    @Query('centre_regional_uuid') centre_regional_uuid?: string,
    @Query('centre_uuid') centre_uuid?: string,
    @Query('chapitre_uuid') chapitre_uuid?: string,
    @Query('district_uuid') district_uuid?: string,
    @Query('groupe_uuid') groupe_uuid?: string,
    @Query('sous_groupe_uuid') sous_groupe_uuid?: string,
    @Query('department_uuid') department_uuid?: string,
    @Query('division_uuid') division_uuid?: string,
  ) {
    const user = req.user;
    const responsibility_structure_uuid = user.responsibilities?.[0]?.structure?.uuid;
    //console.log(user)
    return this.structureTreeService.getMemberStatsByConnectedUser(
      user.member_uuid,
      responsibility_structure_uuid,
      {
        region_uuid,
        centre_regional_uuid,
        centre_uuid,
        chapitre_uuid,
        district_uuid,
        groupe_uuid,
        sous_groupe_uuid,
        department_uuid,
        division_uuid,
      },
      this.buildPerimeter(req),
    );
  }

  @Get('my-committee')
  @RequirePermissions('structures_voir')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({
    summary: 'Comité de la structure de l\'utilisateur connecté',
  })
  async getMyCommittee(@Req() req) {
    return this.structureService.getMyCommittee(req.user);
  }

  @Get(':uuid/committee')
  @RequirePermissions('structures_voir')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({
    summary: 'Comité (responsables + responsabilités vacantes) d\'une structure',
  })
  @ApiParam({ name: 'uuid', description: 'UUID de la structure' })
  async getCommitteeByStructure(@Req() req, @Param('uuid') uuid: string) {
    await this.assertDansPerimetre(req, uuid);
    return this.structureService.getCommittee(uuid);
  }

@Post('stats/export/:category')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('exports_voir_menu_exports')
@ApiOperation({
  summary: 'Exporter les membres par catégorie de statistiques',
  description: 'Génère un fichier Excel contenant la liste des membres selon la catégorie choisie (total, hommes, femmes, départements, divisions)'
})
@ApiParam({
  name: 'category',
  enum: ['total', 'hommes', 'femmes', 'dept_hommes', 'dept_femmes', 'dept_jeunesse', 'div_jeune_homme', 'div_jeune_femme', 'div_avenir'],
  description: 'Catégorie de membres à exporter',
  example: 'total',
  required: true
})
@ApiBody({
  description: 'Filtres optionnels pour affiner la recherche',
  schema: {
    type: 'object',
    properties: {
      region_uuid: {
        type: 'string',
        description: 'UUID de la région',
        example: '550e8400-e29b-41d4-a716-446655440000'
      },
      centre_uuid: {
        type: 'string',
        description: 'UUID du centre',
        example: '550e8400-e29b-41d4-a716-446655440001'
      },
      chapitre_uuid: {
        type: 'string',
        description: 'UUID du chapitre',
        example: '550e8400-e29b-41d4-a716-446655440002'
      },
      district_uuid: {
        type: 'string',
        description: 'UUID du district',
        example: '550e8400-e29b-41d4-a716-446655440003'
      },
      groupe_uuid: {
        type: 'string',
        description: 'UUID du groupe',
        example: '550e8400-e29b-41d4-a716-446655440004'
      },
      department_uuid: {
        type: 'string',
        description: 'UUID du département',
        example: '550e8400-e29b-41d4-a716-446655440005'
      },
      division_uuid: {
        type: 'string',
        description: 'UUID de la division',
        example: '550e8400-e29b-41d4-a716-446655440006'
      }
    }
  }
})
@ApiResponse({
  status: 200,
  description: 'Export lancé avec succès',
  schema: {
    type: 'object',
    properties: {
      success: {
        type: 'boolean',
        example: true
      },
      message: {
        type: 'string',
        example: 'Export en cours de traitement'
      },
      jobId: {
        type: 'string',
        example: '550e8400-e29b-41d4-a716-446655440000'
      },
      checkStatusUrl: {
        type: 'string',
        example: '/export/status/550e8400-e29b-41d4-a716-446655440000'
      }
    }
  }
})
@ApiResponse({
  status: 401,
  description: 'Non autorisé - Token JWT manquant ou invalide'
})
@ApiResponse({
  status: 404,
  description: 'Membre ou structure non trouvé(e)'
})
@ApiResponse({
  status: 400,
  description: 'Catégorie invalide'
})
@ApiBearerAuth()
async exportStatCategory(
  @Param('category') category: string,
  @Body() filters: MemberStatsFilters,
  @Request() req,
) {
  const memberUuid = req.user.member_uuid;
  const user = req.user;
  const user_uuid = req.user.uuid;
  const responsibilityStructureUuid = user.responsibilities?.[0]?.structure?.uuid;
  return this.structureTreeService.exportMembersByStatCategory(
    user_uuid,
    memberUuid,
    responsibilityStructureUuid,
    category as any,
    filters,
    this.buildPerimeter(req),
  );
}

  @Get('tree')
  @RequirePermissions('structures_voir')
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
  async getTree(@Req() req, @Query('root_uuid') rootUuid?: string) {
    // Sans racine demandée, un non-admin part de SA racine plutôt que de l'arbre national.
    const perimetre = this.buildPerimeter(req);
    if (!rootUuid && !perimetre.isAdmin) rootUuid = perimetre.allowedRootUuids[0];
    await this.assertDansPerimetre(req, rootUuid);

    return this.structureTreeService.getStructureTreeWithCounts(rootUuid);
  }

  @Get()
  @RequirePermissions('structures_voir')
  @ApiOperation({
    summary: 'Liste de toutes les structures',
  })
  @ApiResponse({
    status: 200,
    description: 'Retour paginé',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  public findAll(@Query() query: StructurePaginationQueryDto) {
    const { page, limit, search } = query;
    return this.structureService.findAll(page, limit, search);
  }

  @Post()
  @RequirePermissions('structures_creer')
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
  @RequirePermissions('structures_voir')
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
  @RequirePermissions('structures_voir')
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
  public async findChildrens(@Req() req, @Query('uuid') uuid: string | undefined) {
    await this.assertDansPerimetre(req, uuid);
    return this.structureService.findChildrens(uuid);
  }

  @Get('by-childrens/:uuid')
  @RequirePermissions('structures_voir')
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
  public async findByChildrens(@Req() req, @Query('uuid') uuid: string | undefined) {
    await this.assertDansPerimetre(req, uuid);
    return this.structureService.findByChildrens(uuid);
  }


  @Get('by-all-childrens/:uuid')
  @RequirePermissions('structures_voir')
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
  public async findByAllChildrens(@Req() req, @Query('uuid') uuid: string) {
    await this.assertDansPerimetre(req, uuid);
    return this.structureService.findByAllChildrens(uuid);
  }

  @Get('find-by-level/:level_uuid')
  @RequirePermissions('structures_voir')
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
  @RequirePermissions('structures_modifier')
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
  @RequirePermissions('structures_supprimer')
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
  @RequirePermissions('structures_voir')
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
    @Req() req,
    @Param('uuid') uuid: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('gender') gender?: 'homme' | 'femme',
    @Query('has_gohonzon') has_gohonzon?: boolean,
    @Query('department_uuid') department_uuid?: string,
    @Query('division_uuid') division_uuid?: string,
  ) {
    return this.structureTreeService.getStructureMembersWithStats(uuid, this.buildPerimeter(req), {
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
