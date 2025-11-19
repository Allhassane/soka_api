import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StructureEntity } from './entities/structure.entity';
import { MemberEntity } from '../members/entities/member.entity';
import { LevelEntity } from '../level/entities/level.entity';
import { ResponsibleInfo, StructureNode } from 'src/shared/interfaces/structure-node.interface';
import { GlobalStats } from 'src/shared/interfaces/GlobalStats';
import { DemographicStats } from 'src/shared/interfaces/DemographicStats';
import { StructureComparison } from 'src/shared/interfaces/StructureComparaison';
import { GrowthStats } from 'src/shared/interfaces/GrowthStats';
import { DepartmentStats, DepartmentSummary, DivisionStats, DivisionSummary, ResponsibleDashboard, StructureStats } from 'src/shared/interfaces/ResponsibleStats';
import { User } from 'src/users/entities/user.entity';



@Injectable()
export class StatistiqueService {
  constructor(
    @InjectRepository(StructureEntity)
    private structureRepository: Repository<StructureEntity>,
    @InjectRepository(MemberEntity)
    private memberRepository: Repository<MemberEntity>,
    @InjectRepository(LevelEntity)
    private levelRepository: Repository<LevelEntity>,
        @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}



    async getStructureTreeWithCounts(rootUuid?: string): Promise<StructureNode[]> {
    // Récupérer toutes les structures
    const structures = await this.structureRepository
      .createQueryBuilder('s')
      .where('s.deleted_at IS NULL')
      .getMany();

    if (structures.length === 0) {
      console.log('Aucune structure dans la base de données');
      return [];
    }

    // Récupérer tous les niveaux
    const levels = await this.levelRepository.find();
    const levelsMap = new Map(levels.map(l => [l.uuid, l.name]));

    // Compter les membres directs par structure
    const memberCounts = await this.memberRepository
      .createQueryBuilder('m')
      .select('m.structure_uuid', 'structure_uuid')
      .addSelect('COUNT(*)', 'count')
      .where('m.deleted_at IS NULL')
      .groupBy('m.structure_uuid')
      .getRawMany();

    const memberCountMap = new Map(
      memberCounts.map(mc => [mc.structure_uuid, parseInt(mc.count)])
    );

    // Récupérer les responsables par structure
    const responsibles = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
      .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
      .select([
        'm.structure_uuid AS structure_uuid',
        'm.uuid AS member_uuid',
        "CONCAT(m.firstname, ' ', m.lastname) AS member_name",
        'r.uuid AS responsibility_uuid',
        'r.name AS responsibility_name',
      ])
      .where('m.deleted_at IS NULL')
      .getRawMany();

    // Grouper les responsables par structure
    const responsiblesMap = new Map<string, ResponsibleInfo[]>();
    for (const resp of responsibles) {
      const structureUuid = resp.structure_uuid;
      if (!structureUuid) continue;

      if (!responsiblesMap.has(structureUuid)) {
        responsiblesMap.set(structureUuid, []);
      }
      responsiblesMap.get(structureUuid)!.push({
        member_uuid: resp.member_uuid,
        member_name: resp.member_name,
        responsibility_uuid: resp.responsibility_uuid,
        responsibility_name: resp.responsibility_name,
      });
    }

    // Construire la map des structures
    const structureMap = new Map<string, StructureNode>();

    for (const structure of structures) {
      const levelUuid = structure.level_uuid ?? null;
      const parentUuid = structure.parent_uuid && structure.parent_uuid.trim() !== ''
        ? structure.parent_uuid
        : null;

      structureMap.set(structure.uuid, {
        uuid: structure.uuid,
        name: structure.name,
        level_uuid: levelUuid,
        level_name: levelUuid ? (levelsMap.get(levelUuid) ?? 'Inconnu') : 'Inconnu',
        parent_uuid: parentUuid,
        direct_members_count: memberCountMap.get(structure.uuid) ?? 0,
        total_members_count: 0,
        sub_groups_count: 0,
        sub_groups_uuids: [],
        responsibles: responsiblesMap.get(structure.uuid) ?? [],  // <-- Ajouté
        children: [],
      });
    }

    // Construire l'arbre (lier parents et enfants)
    const rootNodes: StructureNode[] = [];

    for (const node of structureMap.values()) {
      if (node.parent_uuid && structureMap.has(node.parent_uuid)) {
        const parent = structureMap.get(node.parent_uuid)!;
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    // Calculer les totaux et collecter les sous-groupes (parcours post-order)
    const calculateTotals = (node: StructureNode): { total: number; subGroupUuids: string[] } => {
      let total = node.direct_members_count;
      let allSubGroupUuids: string[] = [];

      for (const child of node.children) {
        const childResult = calculateTotals(child);
        total += childResult.total;

        allSubGroupUuids.push(child.uuid);
        allSubGroupUuids = allSubGroupUuids.concat(childResult.subGroupUuids);
      }

      node.total_members_count = total;
      node.sub_groups_uuids = allSubGroupUuids;
      node.sub_groups_count = allSubGroupUuids.length;

      return { total, subGroupUuids: allSubGroupUuids };
    };

    // Appliquer le calcul à tous les nœuds racines
    for (const root of rootNodes) {
      calculateTotals(root);
    }

    // Si un uuid racine est spécifié, retourner uniquement cette branche
    if (rootUuid && structureMap.has(rootUuid)) {
      return [structureMap.get(rootUuid)!];
    }

    return rootNodes;
  }


  async getGlobalStats(): Promise<GlobalStats> {
    const tree = await this.getStructureTreeWithCounts();

    let totalStructures = 0;
    let totalMembers = 0;
    let totalResponsibles = 0;
    let structuresWithoutResponsibles = 0;
    let structuresWithoutMembers = 0;

    const levelStats = new Map<string, {
      level_uuid: string;
      level_name: string;
      count: number;
      members_count: number;
    }>();

    const allStructures: {
      uuid: string;
      name: string;
      level_name: string;
      total_members_count: number;
    }[] = [];

    const processNode = (node: StructureNode) => {
      totalStructures++;
      totalMembers += node.direct_members_count;
      totalResponsibles += node.responsibles.length;

      if (node.responsibles.length === 0) structuresWithoutResponsibles++;
      if (node.direct_members_count === 0) structuresWithoutMembers++;

      // Stats par niveau
      const key = node.level_uuid || 'unknown';
      if (!levelStats.has(key)) {
        levelStats.set(key, {
          level_uuid: node.level_uuid || '',
          level_name: node.level_name,
          count: 0,
          members_count: 0,
        });
      }
      const stat = levelStats.get(key)!;
      stat.count++;
      stat.members_count += node.direct_members_count;

      allStructures.push({
        uuid: node.uuid,
        name: node.name,
        level_name: node.level_name,
        total_members_count: node.total_members_count,
      });

      for (const child of node.children) {
        processNode(child);
      }
    };

    for (const root of tree) {
      processNode(root);
    }

    return {
      total_structures: totalStructures,
      total_members: totalMembers,
      total_responsibles: totalResponsibles,
      structures_by_level: Array.from(levelStats.values()).map(stat => ({
        ...stat,
        avg_members_per_structure: stat.count > 0
          ? Math.round((stat.members_count / stat.count) * 100) / 100
          : 0,
      })),
      structures_without_responsibles: structuresWithoutResponsibles,
      structures_without_members: structuresWithoutMembers,
      top_5_structures_by_members: allStructures
        .sort((a, b) => b.total_members_count - a.total_members_count)
        .slice(0, 5),
    };
  }

  async getDemographicStats(structureUuid: string): Promise<DemographicStats> {
    // Récupérer tous les sous-groupes
    const tree = await this.getStructureTreeWithCounts(structureUuid);
    if (tree.length === 0) throw new NotFoundException('Structure non trouvée');

    const allStructureUuids = [structureUuid, ...tree[0].sub_groups_uuids];

    const members = await this.memberRepository
      .createQueryBuilder('m')
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL')
      .getMany();

    const now = new Date();
    let hommes = 0, femmes = 0;
    const ageGroups = { '0-18': 0, '19-35': 0, '36-50': 0, '51-65': 0, '65+': 0 };
    let totalMembershipYears = 0;
    let gohonzonCount = 0;

    for (const member of members) {
      // Genre
      if (member.gender === 'homme') hommes++;
      else femmes++;

      // Âge
      if (member.birth_date) {
        const age = Math.floor((now.getTime() - new Date(member.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        if (age <= 18) ageGroups['0-18']++;
        else if (age <= 35) ageGroups['19-35']++;
        else if (age <= 50) ageGroups['36-50']++;
        else if (age <= 65) ageGroups['51-65']++;
        else ageGroups['65+']++;
      }

      // Ancienneté
      if (member.membership_date) {
        const years = (now.getTime() - new Date(member.membership_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000);
        totalMembershipYears += years;
      }

      // Gohonzon
      if (member.has_gohonzon) gohonzonCount++;
    }

    // Membres avec responsabilités
    const membersWithResp = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid')
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL')
      .andWhere('mr.deleted_at IS NULL')
      .getCount();

    const total = members.length;

    return {
      structure_uuid: structureUuid,
      structure_name: tree[0].name,
      gender_distribution: {
        homme: hommes,
        femme: femmes,
        ratio: total > 0 ? `${Math.round((hommes / total) * 100)}% / ${Math.round((femmes / total) * 100)}%` : '0% / 0%',
      },
      age_distribution: ageGroups,
      avg_membership_duration_years: total > 0
        ? Math.round((totalMembershipYears / total) * 10) / 10
        : 0,
      gohonzon_rate: total > 0
        ? Math.round((gohonzonCount / total) * 100)
        : 0,
      members_with_responsibilities: membersWithResp,
    };
  }

  async compareStructures(structureUuids: string[]): Promise<StructureComparison> {
    const results: StructureComparison['structures'] = [];

    for (const uuid of structureUuids) {
      // Récupérer l'arbre de chaque structure
      const tree = await this.getStructureTreeWithCounts(uuid);
      if (tree.length === 0) continue;

      const node = tree[0];

      // Compter les sous-groupes directs avec des membres
      const subGroupsWithMembers = node.children.filter(
        child => child.total_members_count > 0
      ).length;

      // Calculer le taux de couverture
      const coverageRate = node.children.length > 0
        ? Math.round((subGroupsWithMembers / node.children.length) * 100)
        : 100; // Si pas d'enfants, couverture = 100%

      results.push({
        uuid: node.uuid,
        name: node.name,
        level_name: node.level_name,
        total_members: node.total_members_count,
        responsibles_count: node.responsibles.length,
        sub_groups_count: node.sub_groups_count,
        avg_members_per_subgroup: node.sub_groups_count > 0
          ? Math.round(node.total_members_count / node.sub_groups_count)
          : node.total_members_count,
        coverage_rate: coverageRate,
      });
    }

    // Trier par nombre de membres (décroissant)
    results.sort((a, b) => b.total_members - a.total_members);

    // Identifier la meilleure performeuse
    const bestPerformer = results[0]?.name || '';

    // Identifier les structures qui nécessitent attention
    const needsAttention = results
      .filter(s =>
        s.coverage_rate < 50 ||           // Couverture faible
        s.responsibles_count === 0 ||     // Pas de responsables
        s.avg_members_per_subgroup < 3    // Trop peu de membres par sous-groupe
      )
      .map(s => s.name);

    // Créer les classements
    const ranking = {
      by_members: [...results]
        .sort((a, b) => b.total_members - a.total_members)
        .map(s => s.name),
      by_coverage: [...results]
        .sort((a, b) => b.coverage_rate - a.coverage_rate)
        .map(s => s.name),
      by_avg_members: [...results]
        .sort((a, b) => b.avg_members_per_subgroup - a.avg_members_per_subgroup)
        .map(s => s.name),
    };

    return {
      structures: results,
      best_performer: bestPerformer,
      needs_attention: needsAttention,
      ranking,
    };
  }


    /**
     * Calcule la date de début de la période analysée
     */
    private getStartDate(now: Date, period: 'month' | 'quarter' | 'year', count: number): Date {
      if (period === 'month') {
        return new Date(now.getFullYear(), now.getMonth() - count, 1);
      } else if (period === 'quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const targetQuarter = currentQuarter - count;
        const year = now.getFullYear() + Math.floor(targetQuarter / 4);
        const quarter = ((targetQuarter % 4) + 4) % 4;
        return new Date(year, quarter * 3, 1);
      } else {
        return new Date(now.getFullYear() - count, 0, 1);
      }
    }

    /**
     * Calcule les dates de début et fin pour une période donnée
     */
    private getPeriodDates(now: Date, period: 'month' | 'quarter' | 'year', offset: number): {
      startDate: Date;
      endDate: Date;
      periodLabel: string;
    } {
      let startDate: Date, endDate: Date, periodLabel: string;

      if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
        endDate = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0);
        periodLabel = startDate.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
      } else if (period === 'quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        const targetQuarter = currentQuarter - offset;
        const year = now.getFullYear() + Math.floor(targetQuarter / 4);
        const quarter = ((targetQuarter % 4) + 4) % 4;

        startDate = new Date(year, quarter * 3, 1);
        endDate = new Date(year, quarter * 3 + 3, 0);
        periodLabel = `T${quarter + 1} ${year}`;
      } else {
        startDate = new Date(now.getFullYear() - offset, 0, 1);
        endDate = new Date(now.getFullYear() - offset, 11, 31);
        periodLabel = startDate.getFullYear().toString();
      }

      return { startDate, endDate, periodLabel };
    }
    async getGrowthStats(
      structureUuid: string,
      period: 'month' | 'quarter' | 'year' = 'month',
      count: number = 12
    ): Promise<GrowthStats[]> {
      const tree = await this.getStructureTreeWithCounts(structureUuid);
      if (tree.length === 0) throw new NotFoundException('Structure non trouvée');

      const allStructureUuids = [structureUuid, ...tree[0].sub_groups_uuids];

      const results: GrowthStats[] = [];
      const now = new Date();
      let cumulativeTotal = 0;

      // D'abord, compter le total initial avant la période analysée
      const initialDate = this.getStartDate(now, period, count);
      const initialCount = await this.memberRepository
        .createQueryBuilder('m')
        .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
        .andWhere('m.membership_date < :date', { date: initialDate })
        .andWhere('m.deleted_at IS NULL')
        .getCount();

      cumulativeTotal = initialCount;

      for (let i = count - 1; i >= 0; i--) {
        const { startDate, endDate, periodLabel } = this.getPeriodDates(now, period, i);

        // Nouveaux membres
        const newMembers = await this.memberRepository
          .createQueryBuilder('m')
          .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
          .andWhere('m.membership_date BETWEEN :start AND :end', {
            start: startDate,
            end: endDate,
          })
          .andWhere('m.deleted_at IS NULL')
          .getCount();

        // Membres partis (deleted_at dans la période)
        const departedMembers = await this.memberRepository
          .createQueryBuilder('m')
          .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
          .andWhere('m.deleted_at BETWEEN :start AND :end', {
            start: startDate,
            end: endDate,
          })
          .getCount();

        // Nouvelles structures
        const newStructures = await this.structureRepository
          .createQueryBuilder('s')
          .where('s.uuid IN (:...uuids)', { uuids: allStructureUuids })
          .andWhere('s.created_at BETWEEN :start AND :end', {
            start: startDate,
            end: endDate,
          })
          .andWhere('s.deleted_at IS NULL')
          .getCount();

        // Nouveaux gohonzon reçus
        const gohonzonReceived = await this.memberRepository
          .createQueryBuilder('m')
          .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
          .andWhere('m.date_gohonzon BETWEEN :start AND :end', {
            start: startDate,
            end: endDate,
          })
          .andWhere('m.deleted_at IS NULL')
          .getCount();

        const netGrowth = newMembers - departedMembers;
        cumulativeTotal += netGrowth;

        results.push({
          period: periodLabel,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          new_members: newMembers,
          departed_members: departedMembers,
          net_growth: netGrowth,
          new_structures: newStructures,
          growth_rate: 0,
          cumulative_total: cumulativeTotal,
          gohonzon_received: gohonzonReceived,
        });
      }

      // Calculer le taux de croissance
      for (let i = 1; i < results.length; i++) {
        const current = results[i].new_members;
        const previous = results[i - 1].new_members;
        results[i].growth_rate = previous > 0
          ? Math.round(((current - previous) / previous) * 100)
          : 0;
      }

      return results;
    }

     async getResponsibleDashboard(userUuid: string): Promise<ResponsibleDashboard> {
    // 1. Récupérer l'utilisateur
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
    });

    if (!user || !user.member_uuid) {
      throw new NotFoundException('Utilisateur non trouvé');
    }

    // 2. Récupérer le membre associé
    const member = await this.memberRepository.findOne({
      where: { uuid: user.member_uuid },
    });

    if (!member || !member.structure_uuid) {
      throw new NotFoundException('Membre ou structure non trouvé');
    }

    // 3. Récupérer l'arbre de la structure du responsable
    const tree = await this.getStructureTreeWithCounts(member.structure_uuid);
    if (tree.length === 0) {
      throw new NotFoundException('Structure non trouvée');
    }

    const rootNode = tree[0];
    const allStructureUuids = [member.structure_uuid, ...rootNode.sub_groups_uuids];

    // 4. Récupérer tous les membres accessibles
    const members = await this.memberRepository
      .createQueryBuilder('m')
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL')
      .getMany();

    const totalMembers = members.length;

    // 5. Calculer les statistiques de base
    const membersWithGohonzon = members.filter(m => m.has_gohonzon).length;
    const hommes = members.filter(m => m.gender === 'homme').length;
    const femmes = members.filter(m => m.gender === 'femme').length;

    // 6. Répartition par âge
    const now = new Date();
    const ageGroups = { '0-18': 0, '19-35': 0, '36-50': 0, '51-65': 0, '65+': 0 };

    for (const m of members) {
      if (m.birth_date) {
        const age = Math.floor(
          (now.getTime() - new Date(m.birth_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        );
        if (age <= 18) ageGroups['0-18']++;
        else if (age <= 35) ageGroups['19-35']++;
        else if (age <= 50) ageGroups['36-50']++;
        else if (age <= 65) ageGroups['51-65']++;
        else ageGroups['65+']++;
      }
    }

    // 7. Compter les responsables
    const totalResponsibles = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL')
      .getCount();

    // 8. Récupérer les infos de la structure et du niveau
    const structure = await this.structureRepository.findOne({
      where: { uuid: member.structure_uuid },
    });

    const level = await this.levelRepository.findOne({
      where: { uuid: structure?.level_uuid },
    });

    // 9. Calculer les statistiques détaillées
    const departmentsStats = await this.getDepartmentsStats(allStructureUuids);
    const departmentsSummary = await this.getDepartmentsSummary(allStructureUuids, totalMembers);
    const divisionsSummary = await this.getDivisionsSummary(allStructureUuids, totalMembers);
    const structuresStats = this.getStructuresStats(rootNode);

    // 10. Construire et retourner le résultat
    return {
      responsible: {
        member_uuid: member.uuid,
        member_name: `${member.firstname} ${member.lastname}`,
        structure_uuid: member.structure_uuid,
        structure_name: structure?.name || 'Inconnu',
        level_name: level?.name || 'Inconnu',
      },
      summary: {
        total_members: totalMembers,
        total_structures: allStructureUuids.length,
        total_responsibles: totalResponsibles,
        members_with_gohonzon: membersWithGohonzon,
        gohonzon_rate: totalMembers > 0
          ? Math.round((membersWithGohonzon / totalMembers) * 100)
          : 0,
        total_hommes: hommes,
        total_femmes: femmes,
        departments: departmentsSummary,
        divisions: divisionsSummary,
      },
      structures_stats: structuresStats,
      departments_stats: departmentsStats,
      gender_distribution: {
        homme: hommes,
        femme: femmes,
        ratio: totalMembers > 0
          ? `${Math.round((hommes / totalMembers) * 100)}% / ${Math.round((femmes / totalMembers) * 100)}%`
          : '0% / 0%',
      },
      age_distribution: ageGroups,
    };
  }

  /**
   * Totaux par département pour le summary
   */
  private async getDepartmentsSummary(
    structureUuids: string[],
    totalMembers: number
  ): Promise<DepartmentSummary[]> {
    const departmentCounts = await this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .select([
        'm.department_uuid AS uuid',
        'd.name AS name',
        'COUNT(*) AS total',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: structureUuids })
      .andWhere('m.deleted_at IS NULL')
      .andWhere('m.department_uuid IS NOT NULL')
      .groupBy('m.department_uuid')
      .addGroupBy('d.name')
      .orderBy('total', 'DESC')
      .getRawMany();

    return departmentCounts.map(dept => ({
      uuid: dept.uuid,
      name: dept.name || 'Sans nom',
      total: parseInt(dept.total),
      percentage: totalMembers > 0
        ? Math.round((parseInt(dept.total) / totalMembers) * 100)
        : 0,
    }));
  }

  /**
   * Totaux par division pour le summary
   */
  private async getDivisionsSummary(
    structureUuids: string[],
    totalMembers: number
  ): Promise<DivisionSummary[]> {
    const divisionCounts = await this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .select([
        'm.division_uuid AS uuid',
        'div.name AS name',
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'COUNT(*) AS total',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: structureUuids })
      .andWhere('m.deleted_at IS NULL')
      .andWhere('m.division_uuid IS NOT NULL')
      .groupBy('m.division_uuid')
      .addGroupBy('div.name')
      .addGroupBy('m.department_uuid')
      .addGroupBy('d.name')
      .orderBy('total', 'DESC')
      .getRawMany();

    return divisionCounts.map(div => ({
      uuid: div.uuid,
      name: div.name || 'Sans nom',
      department_uuid: div.department_uuid,
      department_name: div.department_name || 'Sans département',
      total: parseInt(div.total),
      percentage: totalMembers > 0
        ? Math.round((parseInt(div.total) / totalMembers) * 100)
        : 0,
    }));
  }

  /**
   * Stats détaillées par département avec divisions imbriquées
   */
  private async getDepartmentsStats(structureUuids: string[]): Promise<DepartmentStats[]> {
    const departmentCounts = await this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .select([
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'COUNT(*) AS count',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: structureUuids })
      .andWhere('m.deleted_at IS NULL')
      .groupBy('m.department_uuid')
      .addGroupBy('d.name')
      .getRawMany();

    const totalMembers = departmentCounts.reduce((sum, d) => sum + parseInt(d.count), 0);
    const results: DepartmentStats[] = [];

    for (const dept of departmentCounts) {
      if (!dept.department_uuid) continue;

      // Récupérer les divisions de ce département
      const divisionCounts = await this.memberRepository
        .createQueryBuilder('m')
        .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
        .select([
          'm.division_uuid AS division_uuid',
          'div.name AS division_name',
          'COUNT(*) AS count',
        ])
        .where('m.structure_uuid IN (:...uuids)', { uuids: structureUuids })
        .andWhere('m.department_uuid = :deptUuid', { deptUuid: dept.department_uuid })
        .andWhere('m.deleted_at IS NULL')
        .groupBy('m.division_uuid')
        .addGroupBy('div.name')
        .getRawMany();

      const deptTotal = parseInt(dept.count);
      const divisions: DivisionStats[] = divisionCounts
        .filter(div => div.division_uuid)
        .map(div => ({
          uuid: div.division_uuid,
          name: div.division_name || 'Sans division',
          members_count: parseInt(div.count),
          percentage: deptTotal > 0
            ? Math.round((parseInt(div.count) / deptTotal) * 100)
            : 0,
        }));

      results.push({
        uuid: dept.department_uuid,
        name: dept.department_name || 'Sans département',
        members_count: deptTotal,
        percentage: totalMembers > 0
          ? Math.round((deptTotal / totalMembers) * 100)
          : 0,
        divisions,
      });
    }

    return results.sort((a, b) => b.members_count - a.members_count);
  }

  /**
   * Stats par structure (racine + enfants directs)
   */
  private getStructuresStats(rootNode: StructureNode): StructureStats[] {
    const results: StructureStats[] = [];

    // Ajouter la structure racine
    results.push({
      uuid: rootNode.uuid,
      name: rootNode.name,
      level_name: rootNode.level_name,
      direct_members: rootNode.direct_members_count,
      total_members: rootNode.total_members_count,
      responsibles_count: rootNode.responsibles.length,
      sub_groups_count: rootNode.sub_groups_count,
    });

    // Ajouter les enfants directs
    for (const child of rootNode.children) {
      results.push({
        uuid: child.uuid,
        name: child.name,
        level_name: child.level_name,
        direct_members: child.direct_members_count,
        total_members: child.total_members_count,
        responsibles_count: child.responsibles.length,
        sub_groups_count: child.sub_groups_count,
      });
    }

    return results.sort((a, b) => b.total_members - a.total_members);
  }

}
