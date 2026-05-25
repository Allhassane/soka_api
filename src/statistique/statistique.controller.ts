import {
  Controller,
  Get,
  Param,
  UseGuards,
  Query,
  Request
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { StatistiqueService } from './statistique.service';
import { StructureTreeNodeDto } from './dto/tree.dto';
import { StructureTreeService } from 'src/structure/structure-tree.service';

@ApiTags('Statistiques')
@Controller('stats')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
export class StatistiqueController {
  constructor(
    private readonly statistiqueService: StatistiqueService,
    private readonly structureTreeService: StructureTreeService
  ) {}

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

  @Get('global')
  @ApiOperation({
    summary: 'Statistiques globales de l\'organisation',
    description: 'Retourne les statistiques globales incluant le total des membres, structures, responsables, etc.',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques globales',
    schema: {
      type: 'object',
      properties: {
        total_structures: { type: 'number', example: 150 },
        total_members: { type: 'number', example: 2500 },
        total_responsibles: { type: 'number', example: 320 },
        structures_by_level: { type: 'array' },
        structures_without_responsibles: { type: 'number', example: 25 },
        structures_without_members: { type: 'number', example: 10 },
        top_5_structures_by_members: { type: 'array' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  async getGlobalStats() {
    return this.statistiqueService.getGlobalStats();
  }

  @Get('demographics/:uuid')
  @ApiOperation({
    summary: 'Statistiques démographiques d\'une structure',
    description: 'Retourne les statistiques démographiques incluant la répartition par genre, âge, ancienneté, etc.',
  })
  @ApiParam({
    name: 'uuid',
    type: String,
    description: 'UUID de la structure',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques démographiques',
    schema: {
      type: 'object',
      properties: {
        structure_uuid: { type: 'string' },
        structure_name: { type: 'string' },
        gender_distribution: {
          type: 'object',
          properties: {
            homme: { type: 'number' },
            femme: { type: 'number' },
            ratio: { type: 'string' },
          },
        },
        age_distribution: {
          type: 'object',
          properties: {
            '0-18': { type: 'number' },
            '19-35': { type: 'number' },
            '36-50': { type: 'number' },
            '51-65': { type: 'number' },
            '65+': { type: 'number' },
          },
        },
        avg_membership_duration_years: { type: 'number' },
        gohonzon_rate: { type: 'number' },
        members_with_responsibilities: { type: 'number' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Structure non trouvée',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  async getDemographicStats(@Param('uuid') uuid: string) {
    return this.statistiqueService.getDemographicStats(uuid);
  }

  @Get('compare')
  @ApiOperation({
    summary: 'Comparer plusieurs structures',
    description: 'Compare les performances de plusieurs structures sur différentes métriques (membres, couverture, responsables, etc.)',
  })
  @ApiQuery({
    name: 'uuids',
    type: [String],
    isArray: true,
    description: 'Liste des UUIDs des structures à comparer',
    example: ['uuid-1', 'uuid-2', 'uuid-3'],
  })
  @ApiResponse({
    status: 200,
    description: 'Comparaison des structures',
    schema: {
      type: 'object',
      properties: {
        structures: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              uuid: { type: 'string' },
              name: { type: 'string' },
              level_name: { type: 'string' },
              total_members: { type: 'number' },
              responsibles_count: { type: 'number' },
              sub_groups_count: { type: 'number' },
              avg_members_per_subgroup: { type: 'number' },
              coverage_rate: { type: 'number' },
            },
          },
        },
        best_performer: { type: 'string' },
        needs_attention: { type: 'array', items: { type: 'string' } },
        ranking: {
          type: 'object',
          properties: {
            by_members: { type: 'array', items: { type: 'string' } },
            by_coverage: { type: 'array', items: { type: 'string' } },
            by_avg_members: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  async compareStructures(@Query('uuids') uuids: string | string[]) {
    const uuidArray = Array.isArray(uuids) ? uuids : [uuids];
    return this.statistiqueService.compareStructures(uuidArray);
  }

  @Get('growth/:uuid')
  @ApiOperation({
    summary: 'Évolution temporelle d\'une structure',
    description: 'Retourne les statistiques de croissance sur une période donnée (nouveaux membres, départs, croissance nette, etc.)',
  })
  @ApiParam({
    name: 'uuid',
    type: String,
    description: 'UUID de la structure',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiQuery({
    name: 'period',
    enum: ['month', 'quarter', 'year'],
    required: false,
    description: 'Période d\'analyse (mois, trimestre, année)',
    example: 'month',
  })
  @ApiQuery({
    name: 'count',
    type: Number,
    required: false,
    description: 'Nombre de périodes à analyser',
    example: 12,
  })
  @ApiResponse({
    status: 200,
    description: 'Statistiques de croissance',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          period: { type: 'string', example: 'nov. 2025' },
          start_date: { type: 'string', example: '2025-11-01' },
          end_date: { type: 'string', example: '2025-11-30' },
          new_members: { type: 'number', example: 15 },
          departed_members: { type: 'number', example: 2 },
          net_growth: { type: 'number', example: 13 },
          new_structures: { type: 'number', example: 1 },
          growth_rate: { type: 'number', example: 25 },
          cumulative_total: { type: 'number', example: 450 },
          gohonzon_received: { type: 'number', example: 5 },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Structure non trouvée',
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  async getGrowthStats(
    @Param('uuid') uuid: string,
    @Query('period') period?: 'month' | 'quarter' | 'year',
    @Query('count') count?: number,
  ) {
    return this.statistiqueService.getGrowthStats(
      uuid,
      period || 'month',
      count || 12,
    );
  }

   @Get('dashboard')
  @ApiOperation({
    summary: 'Dashboard du responsable connecté',
    description: `
      Retourne les statistiques personnalisées pour le responsable connecté basées sur son périmètre.
      Inclut :
      - Informations du responsable
      - Résumé global (membres, structures, responsables, gohonzon)
      - Totaux par genre (hommes/femmes)
      - Totaux par département
      - Totaux par division
      - Stats par structure
      - Stats détaillées par département avec divisions
      - Répartition par âge
    `,
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard du responsable',
    schema: {
      type: 'object',
      properties: {
        responsible: {
          type: 'object',
          properties: {
            member_uuid: { type: 'string' },
            member_name: { type: 'string' },
            structure_uuid: { type: 'string' },
            structure_name: { type: 'string' },
            level_name: { type: 'string' },
          },
        },
        summary: {
          type: 'object',
          properties: {
            total_members: { type: 'number', example: 450 },
            total_structures: { type: 'number', example: 45 },
            total_responsibles: { type: 'number', example: 28 },
            members_with_gohonzon: { type: 'number', example: 380 },
            gohonzon_rate: { type: 'number', example: 84 },
            total_hommes: { type: 'number', example: 200 },
            total_femmes: { type: 'number', example: 250 },
            departments: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  uuid: { type: 'string' },
                  name: { type: 'string' },
                  total: { type: 'number' },
                  percentage: { type: 'number' },
                },
              },
            },
            divisions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  uuid: { type: 'string' },
                  name: { type: 'string' },
                  department_uuid: { type: 'string' },
                  department_name: { type: 'string' },
                  total: { type: 'number' },
                  percentage: { type: 'number' },
                },
              },
            },
          },
        },
        structures_stats: { type: 'array' },
        departments_stats: { type: 'array' },
        gender_distribution: {
          type: 'object',
          properties: {
            homme: { type: 'number' },
            femme: { type: 'number' },
            ratio: { type: 'string' },
          },
        },
        age_distribution: {
          type: 'object',
          properties: {
            '0-18': { type: 'number' },
            '19-35': { type: 'number' },
            '36-50': { type: 'number' },
            '51-65': { type: 'number' },
            '65+': { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Non autorisé - Authentification requise',
  })
  @ApiResponse({
    status: 404,
    description: 'Utilisateur, membre ou structure non trouvé',
  })
  async getResponsibleDashboard(@Request() req) {
    return this.statistiqueService.getResponsibleDashboard(req.user.uuid);
  }

}
