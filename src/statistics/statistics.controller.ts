import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/guards/auth.guard';
import { PermissionsGuard } from 'src/auth/guards/permissions.guard';
import { RequirePermissions } from 'src/auth/decorators/require-permissions.decorator';
import { allowedRootUuidsFromJwt } from 'src/access-scope/perimeter-from-jwt';
import { MemberFiltersDto } from './dto/member-filters.dto';
import { StatisticsService } from './statistics.service';
import { PERM_STATS_MEMBRES, StatsPerimeter } from './statistics.helpers';

/**
 * **Statistiques membres** - un endpoint par onglet de l'écran, et pas un de plus.
 *
 * 🚨 Règle héritée de l'échec du module `statistique` supprimé le 2026-08-01 (6 routes
 * `/stats/*` sans aucun appelant web) : **aucune route ne naît sans son écran**. Chaque
 * méthode ci-dessous est appelée par `/statistiques/membres` côté web.
 *
 * 🚨 **Tout est en LECTURE.** Aucune de ces routes n'écrit dans quoi que ce soit.
 *
 * ⚠️ **Le périmètre vient du JWT, jamais de la requête** (`buildPerimeter`). Un responsable
 * ne voit que sa branche, l'administrateur voit tout, et un utilisateur sans racine de
 * périmètre ne voit **rien** - jamais « tout par défaut ».
 */
@ApiBearerAuth()
@ApiTags('Statistiques')
@Controller('statistics/members')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StatisticsController {
  constructor(private readonly stats: StatisticsService) {}

  private buildPerimeter(req: any): StatsPerimeter {
    const user = req?.user ?? {};
    return {
      isAdmin: user.is_admin === true,
      allowedRootUuids: allowedRootUuidsFromJwt(user),
    };
  }

  @Get('filters')
  @RequirePermissions(PERM_STATS_MEMBRES)
  @ApiOperation({
    summary: 'Options des filtres : référentiels courts et racines de la cascade',
  })
  async filters(@Req() req: any) {
    return this.stats.filterOptions(this.buildPerimeter(req));
  }

  @Get('overview')
  @RequirePermissions(PERM_STATS_MEMBRES)
  @ApiOperation({
    summary: "Vue d'ensemble : effectif, les 3 notions de « jeune », Gohonzon, adoption, pyramide",
  })
  async overview(@Query() filters: MemberFiltersDto, @Req() req: any) {
    return this.stats.overview(filters, this.buildPerimeter(req));
  }

  @Get('demography')
  @RequirePermissions(PERM_STATS_MEMBRES)
  @ApiOperation({
    summary: 'Démographie : genre, départements, divisions, âges, foyers, professions, villes',
  })
  async demography(@Query() filters: MemberFiltersDto, @Req() req: any) {
    return this.stats.demography(filters, this.buildPerimeter(req));
  }

  @Get('practice')
  @RequirePermissions(PERM_STATS_MEMBRES)
  @ApiOperation({
    summary:
      'Pratique et ancienneté : Gohonzon (taux, délai, cohortes), Tokusso, Omamori, adhésions',
  })
  async practice(@Query() filters: MemberFiltersDto, @Req() req: any) {
    return this.stats.practice(filters, this.buildPerimeter(req));
  }

  @Get('vitality')
  @RequirePermissions(PERM_STATS_MEMBRES)
  @ApiOperation({
    summary: 'Encadrement et vitalité : mandats, féminisation, santé des sous-groupes',
  })
  async vitality(@Query() filters: MemberFiltersDto, @Req() req: any) {
    return this.stats.vitality(filters, this.buildPerimeter(req));
  }

  @Get('adoption')
  @RequirePermissions(PERM_STATS_MEMBRES)
  @ApiOperation({
    summary: 'Adoption numérique : entonnoir, taux de réussite, journal de connexion',
  })
  async adoption(@Query() filters: MemberFiltersDto, @Req() req: any) {
    return this.stats.adoption(filters, this.buildPerimeter(req));
  }

  @Get('quality')
  @RequirePermissions(PERM_STATS_MEMBRES)
  @ApiOperation({
    summary: 'Qualité des données : complétude, incohérences, doublons potentiels',
  })
  async quality(@Query() filters: MemberFiltersDto, @Req() req: any) {
    return this.stats.quality(filters, this.buildPerimeter(req));
  }
}
