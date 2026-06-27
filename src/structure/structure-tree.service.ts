import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { StructureEntity } from './entities/structure.entity';
import { MemberEntity } from '../members/entities/member.entity';
import { LevelEntity } from '../level/entities/level.entity';
import { ResponsibilityEntity } from '../responsibilities/entities/responsibility.entity';
import { MemberResponsibilityEntity } from '../member-responsibility/entities/member-responsibility.entity';
import { ResponsibleInfo, StructureNode } from 'src/shared/interfaces/structure-node.interface';
import { StructureMembersStats } from 'src/shared/interfaces/StructureMembersStats';
import { AuthService } from 'src/auth/auth.service';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { ExportJobStatus } from 'src/export-async/entities/export-job.entity';
import { ExportJobService } from 'src/export-async/export-job.service';
import { ExportProcessorService } from 'src/export-async/export-processor.service';
import * as fs from 'fs';
import * as path from 'path';

export interface PaginationMemberParams {
  page?: number;
  limit?: number;
  search?: string;
  gender?: 'homme' | 'femme';
  has_gohonzon?: boolean;
  department_uuid?: string;
  division_uuid?: string;
}

export interface MemberStatsFilters {
  region_uuid?: string;
  centre_regional_uuid?: string;
  centre_uuid?: string;
  chapitre_uuid?: string;
  district_uuid?: string;
  groupe_uuid?: string;
  sous_groupe_uuid?: string;
  department_uuid?: string;
  division_uuid?: string;
}

export interface MemberStatsResponse {
  filters_available: {
    regions: { uuid: string; name: string }[];
    centre_regionaux: { uuid: string; name: string }[];
    centres: { uuid: string; name: string }[];
    chapitres: { uuid: string; name: string }[];
    districts: { uuid: string; name: string }[];
    groupes: { uuid: string; name: string }[];
  };
  stats: {
    total_members: number;
    total_hommes: number;
    total_femmes: number;
    departments: {
      total: number;
      hommes: number;
      femmes: number;
      jeunesse: number;
      stats: {
        percent_man: number;
        percent_woman: number;
        percent_young: number;
      }
    };
    divisions: {
      total: number;
      jeune_homme: number;
      jeune_femme: number;
      avenir: number;
      stats: {
        percent_man: number;
        percent_woman: number;
        percent_young: number;
      }
    };
  };
  breadcrumb: {
    region?: { uuid: string; name: string };
    centre?: { uuid: string; name: string };
    chapitre?: { uuid: string; name: string };
    district?: { uuid: string; name: string };
    groupe?: { uuid: string; name: string };
  };
}

@Injectable()
export class StructureTreeService {
  constructor(
    @InjectRepository(StructureEntity)
    private structureRepository: Repository<StructureEntity>,
    @InjectRepository(MemberEntity)
    private memberRepository: Repository<MemberEntity>,
    @InjectRepository(LevelEntity)
    private levelRepository: Repository<LevelEntity>,
    @InjectRepository(ResponsibilityEntity)
    private responsibilityRepository: Repository<ResponsibilityEntity>,
    @InjectRepository(MemberResponsibilityEntity)
    private memberResponsibilityRepository: Repository<MemberResponsibilityEntity>,

    private exportJobService: ExportJobService,
    // Dépendance circulaire ExportProcessorService <-> StructureTreeService → forwardRef.
    @Inject(forwardRef(() => ExportProcessorService))
    private exportProcessorService: ExportProcessorService,

  ) { }


  async getStructureTreeWithCounts(rootUuid?: string): Promise<StructureNode[]> {
    // Récupérer toutes les structures
    const structures = await this.structureRepository
      .createQueryBuilder('s')
      .where('s.deleted_at IS NULL')
      .getMany();

    if (structures.length === 0) {
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
        responsibles: responsiblesMap.get(structure.uuid) ?? [],
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


  /*
  async getStructureMembersWithStats__(structureUuid: string): Promise<StructureMembersStats> {
    // 1. Récupérer la structure
    const structure = await this.structureRepository.findOne({
      where: { uuid: structureUuid },
    });

    if (!structure) {
      throw new NotFoundException('Structure non trouvée');
    }

    // 2. Récupérer le niveau
    const level = await this.levelRepository.findOne({
      where: { uuid: structure.level_uuid },
    });

    // 3. Récupérer les responsables de cette structure spécifique
    const structureResponsibles = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
      .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
      .select([
        'm.uuid AS member_uuid',
        "CONCAT(m.firstname, ' ', m.lastname) AS member_name",
        'r.uuid AS responsibility_uuid',
        'r.name AS responsibility_name',
      ])
      .where('m.structure_uuid = :structureUuid', { structureUuid })
      .andWhere('m.deleted_at IS NULL')
      .getRawMany();

    // 4. Récupérer toutes les sous-structures (récursivement)
    const allStructureUuids = await this.getAllSubStructureUuids(structureUuid);

    // 5. Récupérer tous les membres
    const members = await this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('structures', 's', 's.uuid = m.structure_uuid')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
      .select([
        'm.uuid AS uuid',
        'm.matricule AS matricule',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.gender AS gender',
        'm.birth_date AS birth_date',
        'm.phone AS phone',
        'm.email AS email',
        'm.structure_uuid AS structure_uuid',
        's.name AS structure_name',
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'm.division_uuid AS division_uuid',
        'div.name AS division_name',
        'm.has_gohonzon AS has_gohonzon',
        'm.membership_date AS membership_date',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL')
      .getRawMany();

    // 6. Récupérer les responsabilités de chaque membre
    const memberResponsibilities = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
      .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
      .select([
        'm.uuid AS member_uuid',
        'r.uuid AS responsibility_uuid',
        'r.name AS responsibility_name',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL')
      .getRawMany();

    // Grouper les responsabilités par membre
    const responsibilitiesMap = new Map<string, { uuid: string; name: string }[]>();
    for (const mr of memberResponsibilities) {
      if (!responsibilitiesMap.has(mr.member_uuid)) {
        responsibilitiesMap.set(mr.member_uuid, []);
      }
      responsibilitiesMap.get(mr.member_uuid)!.push({
        uuid: mr.responsibility_uuid,
        name: mr.responsibility_name,
      });
    }

    // 7. Calculer les statistiques
    const totalMembers = members.length;
    const hommes = members.filter(m => m.gender === 'homme').length;
    const femmes = members.filter(m => m.gender === 'femme').length;
    const withGohonzon = members.filter(m => m.has_gohonzon).length;

    // Répartition par âge
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

    // Stats par département
    const departmentStats = await this.getDepartmentsSummary(allStructureUuids, totalMembers);

    // Stats par division
    const divisionStats = await this.getDivisionsSummary(allStructureUuids, totalMembers);

    // Compter les responsables (membres uniques avec au moins une responsabilité)
    const totalResponsibles = memberResponsibilities.length > 0
      ? new Set(memberResponsibilities.map(mr => mr.member_uuid)).size
      : 0;

    // 8. Formater les membres avec leurs responsabilités
    const formattedMembers = members.map(m => ({
      uuid: m.uuid,
      matricule: m.matricule,
      firstname: m.firstname,
      lastname: m.lastname,
      gender: m.gender,
      birth_date: m.birth_date,
      phone: m.phone,
      email: m.email,
      structure_uuid: m.structure_uuid,
      structure_name: m.structure_name,
      department_uuid: m.department_uuid,
      department_name: m.department_name,
      division_uuid: m.division_uuid,
      division_name: m.division_name,
      has_gohonzon: m.has_gohonzon,
      membership_date: m.membership_date,
      responsibilities: responsibilitiesMap.get(m.uuid) || [],
    }));

    // 9. Retourner le résultat
    return {
      structure: {
        uuid: structure.uuid,
        name: structure.name,
        level_uuid: structure.level_uuid ?? null,
        level_name: level?.name || 'Inconnu',
        responsibles: structureResponsibles.map(r => ({
          member_uuid: r.member_uuid,
          member_name: r.member_name,
          responsibility_uuid: r.responsibility_uuid,
          responsibility_name: r.responsibility_name,
        })),
      },
      stats: {
        total_members: totalMembers,
        total_hommes: hommes,
        total_femmes: femmes,
        total_with_gohonzon: withGohonzon,
        gohonzon_rate: totalMembers > 0
          ? Math.round((withGohonzon / totalMembers) * 100)
          : 0,
        total_responsibles: totalResponsibles,
        total_sub_structures: allStructureUuids.length - 1,
        age_distribution: ageGroups,
        departments: departmentStats,
        divisions: divisionStats,
      },
      members: formattedMembers,
    };
  }
  */

  async getStructureMembersWithStats(
    structureUuid: string,
    paginationParams?: PaginationMemberParams
  ): Promise<StructureMembersStats> {
    // Paramètres de pagination par défaut
    const page = paginationParams?.page || 1;
    const limit = paginationParams?.limit || 20;
    const offset = (page - 1) * limit;

    // 1. Récupérer la structure
    const structure = await this.structureRepository.findOne({
      where: { uuid: structureUuid },
    });

    if (!structure) {
      throw new NotFoundException('Structure non trouvée');
    }

    // 2. Récupérer le niveau
    let level: LevelEntity | null = null;
    if (structure.level_uuid) {
      level = await this.levelRepository.findOne({
        where: { uuid: structure.level_uuid },
      });
    }

    // 3. Récupérer les responsables de cette structure spécifique
    const structureResponsibles = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
      .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
      .select([
        'm.uuid AS member_uuid',
        "CONCAT(m.firstname, ' ', m.lastname) AS member_name",
        'r.uuid AS responsibility_uuid',
        'r.name AS responsibility_name',
      ])
      .where('m.structure_uuid = :structureUuid', { structureUuid })
      .andWhere('m.deleted_at IS NULL')
      .getRawMany();

    // 4. Récupérer toutes les sous-structures (récursivement)
    const allStructureUuids = await this.getAllSubStructureUuids(structureUuid);

    // 5. Construire la requête de base pour les membres
    let membersQuery = this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('structures', 's', 's.uuid = m.structure_uuid')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
      .select([
        'm.uuid AS uuid',
        'm.matricule AS matricule',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.gender AS gender',
        'm.birth_date AS birth_date',
        'm.phone AS phone',
        'm.email AS email',
        'm.structure_uuid AS structure_uuid',
        's.name AS structure_name',
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'm.division_uuid AS division_uuid',
        'div.name AS division_name',
        'm.has_gohonzon AS has_gohonzon',
        'm.membership_date AS membership_date',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL');

    // Appliquer les filtres optionnels
    if (paginationParams?.search) {
      membersQuery = membersQuery.andWhere(
        "(m.firstname LIKE :search OR m.lastname LIKE :search OR m.matricule LIKE :search OR m.phone LIKE :search OR m.email LIKE :search)",
        { search: `%${paginationParams.search}%` }
      );
    }

    if (paginationParams?.gender) {
      membersQuery = membersQuery.andWhere('m.gender = :gender', {
        gender: paginationParams.gender
      });
    }

    if (paginationParams?.has_gohonzon !== undefined) {
      membersQuery = membersQuery.andWhere('m.has_gohonzon = :hasGohonzon', {
        hasGohonzon: paginationParams.has_gohonzon
      });
    }

    if (paginationParams?.department_uuid) {
      membersQuery = membersQuery.andWhere('m.department_uuid = :deptUuid', {
        deptUuid: paginationParams.department_uuid
      });
    }

    if (paginationParams?.division_uuid) {
      membersQuery = membersQuery.andWhere('m.division_uuid = :divUuid', {
        divUuid: paginationParams.division_uuid
      });
    }

    // 6. Compter le total pour la pagination
    const totalCount = await membersQuery.getCount();

    // 7. Récupérer les membres paginés
    const members = await membersQuery
      .orderBy('m.firstname', 'ASC')
      .addOrderBy('m.lastname', 'ASC')
      .offset(offset)
      .limit(limit)
      .getRawMany();

    // 8. Récupérer tous les membres pour les stats (sans pagination)
    const allMembersForStats = await this.memberRepository
      .createQueryBuilder('m')
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL')
      .getMany();

    // 9. Récupérer les responsabilités des membres paginés
    const memberUuids = members.map(m => m.uuid);
    let memberResponsibilities: any[] = [];

    if (memberUuids.length > 0) {
      memberResponsibilities = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
        .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
        .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
        .select([
          'm.uuid AS member_uuid',
          'r.uuid AS responsibility_uuid',
          'r.name AS responsibility_name',
          'r.level_uuid AS level_uuid',
          'l.name AS level_name',
          'l.order AS level_order',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();
    }

    // Grouper les responsabilités par membre
    const responsibilitiesMap = new Map<string, any[]>();
    for (const mr of memberResponsibilities) {
      if (!responsibilitiesMap.has(mr.member_uuid)) {
        responsibilitiesMap.set(mr.member_uuid, []);
      }
      responsibilitiesMap.get(mr.member_uuid)!.push({
        uuid: mr.responsibility_uuid,
        name: mr.responsibility_name,
        level_uuid: mr.level_uuid,
        level_name: mr.level_name,
        level_order: mr.level_order,
      });
    }

    // 10. Construire les structure_tree pour chaque membre
    const memberStructureTreeMap = new Map<string, any>();

    for (const member of members) {
      if (!member.structure_uuid) continue;

      const memberResponsibilitiesList = responsibilitiesMap.get(member.uuid) || [];

      // Si le membre a des responsabilités, utiliser le niveau le plus haut
      if (memberResponsibilitiesList.length > 0) {
        const validResponsibilities = memberResponsibilitiesList.filter(r => r.level_order !== null);

        if (validResponsibilities.length > 0) {
          const highestLevelOrder = Math.min(
            ...validResponsibilities.map(r => parseInt(r.level_order))
          );

          const tree = await this.getStructureTreeForResponsible(
            member.structure_uuid,
            highestLevelOrder
          );

          memberStructureTreeMap.set(member.uuid, tree);
        } else {
          // Pas de level_order valide, utiliser l'arbre complet
          const tree = await this.getStructureTreeForResponsible(
            member.structure_uuid,
            999  // Ordre très élevé pour tout afficher
          );
          memberStructureTreeMap.set(member.uuid, tree);
        }
      } else {
        // Pas de responsabilité, afficher l'arbre complet depuis sa structure
        const tree = await this.getStructureTreeForResponsible(
          member.structure_uuid,
          999  // Ordre très élevé pour tout afficher
        );
        memberStructureTreeMap.set(member.uuid, tree);
      }
    }

    // 11. Calculer les statistiques (sur tous les membres, pas seulement les paginés)
    const totalMembers = allMembersForStats.length;
    const hommes = allMembersForStats.filter(m => m.gender === 'homme').length;
    const femmes = allMembersForStats.filter(m => m.gender === 'femme').length;
    const withGohonzon = allMembersForStats.filter(m => m.has_gohonzon).length;

    // Répartition par âge
    const now = new Date();
    const ageGroups = { '0-18': 0, '19-35': 0, '36-50': 0, '51-65': 0, '65+': 0 };
    for (const m of allMembersForStats) {
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

    // Stats par département
    const departmentStats = await this.getDepartmentsSummary(allStructureUuids, totalMembers);

    // Stats par division
    const divisionStats = await this.getDivisionsSummary(allStructureUuids, totalMembers);

    // Compter les responsables
    const allResponsibilities = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
      .select('m.uuid', 'member_uuid')
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL')
      .getRawMany();

    const totalResponsibles = new Set(allResponsibilities.map(r => r.member_uuid)).size;

    // 12. Formater les membres paginés avec leurs responsabilités et structure_tree
    const formattedMembers = members.map(m => ({
      uuid: m.uuid,
      matricule: m.matricule,
      firstname: m.firstname,
      lastname: m.lastname,
      gender: m.gender,
      birth_date: m.birth_date,
      phone: m.phone,
      email: m.email,
      structure_uuid: m.structure_uuid,
      structure_name: m.structure_name,
      department_uuid: m.department_uuid,
      department_name: m.department_name,
      division_uuid: m.division_uuid,
      division_name: m.division_name,
      has_gohonzon: m.has_gohonzon,
      membership_date: m.membership_date,
      responsibilities: responsibilitiesMap.get(m.uuid) || [],
      structure_tree: memberStructureTreeMap.get(m.uuid) || null,  // ✅ Ajout du structure_tree
    }));

    // 13. Calculer les infos de pagination
    const totalPages = Math.ceil(totalCount / limit);

    // 14. Retourner le résultat
    return {
      structure: {
        uuid: structure.uuid,
        name: structure.name,
        level_uuid: structure.level_uuid ?? null,
        level_name: level?.name || 'Inconnu',
        responsibles: structureResponsibles.map(r => ({
          member_uuid: r.member_uuid,
          member_name: r.member_name,
          responsibility_uuid: r.responsibility_uuid,
          responsibility_name: r.responsibility_name,
        })),
      },
      stats: {
        total_members: totalMembers,
        total_hommes: hommes,
        total_femmes: femmes,
        total_with_gohonzon: withGohonzon,
        gohonzon_rate: totalMembers > 0
          ? Math.round((withGohonzon / totalMembers) * 100)
          : 0,
        total_responsibles: totalResponsibles,
        total_sub_structures: allStructureUuids.length - 1,
        age_distribution: ageGroups,
        departments: departmentStats,
        divisions: divisionStats,
      },
      members: formattedMembers,
      pagination: {
        current_page: page,
        per_page: limit,
        total_items: totalCount,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_previous: page > 1,
      },
    };
  }

  // --- Cache du dataset « structure_tree » -------------------------------------------
  // Construire la structureMap complète (toutes structures + niveaux + counts +
  // responsables + totaux) coûte plusieurs secondes. Avant, `getStructureTreeForResponsible`
  // refaisait TOUT ce travail à CHAQUE appel - or il est appelé UNE FOIS PAR MEMBRE dans
  // les listes paginées → ~10 rechargements complets/page → ~57 s → timeout passerelle (500).
  // On construit donc la map UNE SEULE FOIS et on la réutilise (TTL court ; map en lecture
  // seule après construction). Le promise est mémoïsé → pas de double construction en
  // parallèle. Fraîcheur des comptages : ≤ TTL (acceptable pour un arbre de comptage).
  private static readonly STRUCTURE_MAP_TTL_MS = 15_000;
  private structureMapCache: {
    at: number;
    mapPromise: Promise<Map<string, any>>;
    filtered: Map<string, any>;
  } | null = null;

  /**
   * structure_tree filtré pour une structure cible.
   * ⚠ `responsibleLevelOrder` est conservé pour compatibilité d'appel mais n'influence PAS
   * la sortie (la coupe se fait à la structure cible, pas au niveau) - comportement
   * identique à l'implémentation précédente. La construction du dataset global est mise en
   * cache et réutilisée pour tous les membres d'une même requête, et le résultat filtré est
   * mémoïsé par `structure_uuid` (deux membres d'une même structure → même arbre).
   */
  public async getStructureTreeForResponsible(
    structureUuid: string,
    responsibleLevelOrder: number,
  ): Promise<any> {
    void responsibleLevelOrder;

    const now = Date.now();
    if (
      !this.structureMapCache ||
      now - this.structureMapCache.at >= StructureTreeService.STRUCTURE_MAP_TTL_MS
    ) {
      this.structureMapCache = {
        at: now,
        mapPromise: this.buildStructureMapWithTotals(),
        filtered: new Map<string, any>(),
      };
    }

    const cache = this.structureMapCache;
    const structureMap = await cache.mapPromise;
    if (structureMap.size === 0) return null;

    if (cache.filtered.has(structureUuid)) {
      return cache.filtered.get(structureUuid);
    }
    const tree = this.buildFilteredTreeFromMap(structureMap, structureUuid);
    cache.filtered.set(structureUuid, tree);
    return tree;
  }

  /**
   * Construit la `structureMap` complète (tous nœuds + level_name/order + comptages directs +
   * responsables + totaux remontés). Coûteux (plusieurs requêtes + ~3600 nœuds) → appelé une
   * seule fois par fenêtre de cache. Retourne une map vide s'il n'y a aucune structure.
   */
  private async buildStructureMapWithTotals(): Promise<Map<string, any>> {
    const structureMap = new Map<string, any>();

    const structures = await this.structureRepository
      .createQueryBuilder('s')
      .where('s.deleted_at IS NULL')
      .getMany();

    if (structures.length === 0) return structureMap;

    const levels = await this.levelRepository.find();
    const levelsMap = new Map(levels.map(l => [l.uuid, { name: l.name, order: l.order }]));

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

    const responsiblesMap = new Map<string, any[]>();
    for (const resp of responsibles) {
      if (!resp.structure_uuid) continue;
      if (!responsiblesMap.has(resp.structure_uuid)) {
        responsiblesMap.set(resp.structure_uuid, []);
      }
      responsiblesMap.get(resp.structure_uuid)!.push({
        member_uuid: resp.member_uuid,
        member_name: resp.member_name,
        responsibility_uuid: resp.responsibility_uuid,
        responsibility_name: resp.responsibility_name,
      });
    }

    for (const structure of structures) {
      const levelUuid = structure.level_uuid ?? null;
      const levelInfo = levelUuid ? levelsMap.get(levelUuid) : null;
      const parentUuid = structure.parent_uuid && structure.parent_uuid.trim() !== ''
        ? structure.parent_uuid
        : null;

      structureMap.set(structure.uuid, {
        uuid: structure.uuid,
        name: structure.name,
        level_uuid: levelUuid,
        level_name: levelInfo?.name || 'Inconnu',
        level_order: levelInfo?.order ?? 999,
        parent_uuid: parentUuid,
        direct_members_count: memberCountMap.get(structure.uuid) ?? 0,
        total_members_count: 0,
        sub_groups_count: 0,
        responsibles: responsiblesMap.get(structure.uuid) ?? [],
        children: [],
      });
    }

    const rootNodes: any[] = [];
    for (const node of structureMap.values()) {
      if (node.parent_uuid && structureMap.has(node.parent_uuid)) {
        const parent = structureMap.get(node.parent_uuid)!;
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    const calculateTotals = (node: any): number => {
      let total = node.direct_members_count;
      let subGroupsCount = 0;

      for (const child of node.children) {
        total += calculateTotals(child);
        subGroupsCount += 1 + child.sub_groups_count;
      }

      node.total_members_count = total;
      node.sub_groups_count = subGroupsCount;

      return total;
    };

    for (const root of rootNodes) {
      calculateTotals(root);
    }

    return structureMap;
  }

  /**
   * À partir d'une `structureMap` déjà construite, produit le structure_tree filtré pour
   * UNE structure cible : remontée jusqu'à la racine puis coupe à la structure cible.
   * FONCTION PURE (aucune requête DB) - c'est ce qui rend l'appel par-membre bon marché.
   */
  private buildFilteredTreeFromMap(
    structureMap: Map<string, any>,
    structureUuid: string,
  ): any {
    const targetStructure = structureMap.get(structureUuid);
    if (!targetStructure) return null;

    // Remonter jusqu'à la racine. Garde anti-cycle : un `parent_uuid` cyclique dans les
    // données héritées provoquerait sinon une boucle infinie (hang).
    const pathToRoot: string[] = [];
    const seen = new Set<string>();
    let currentUuid: string | null | undefined = structureUuid;

    while (currentUuid && !seen.has(currentUuid)) {
      seen.add(currentUuid);
      pathToRoot.push(currentUuid);
      currentUuid = structureMap.get(currentUuid)?.parent_uuid;
    }

    const rootUuid = pathToRoot[pathToRoot.length - 1];
    const rootStructure = structureMap.get(rootUuid);
    if (!rootStructure) return null;

    // Filtrer l'arbre : garder le chemin vers la structure cible et couper à la cible.
    const filterTree = (node: any, pathUuids: string[]): any => {
      const { level_order, ...nodeWithoutOrder } = node;
      void level_order;
      const isOnPath = pathUuids.includes(node.uuid);
      const isTarget = node.uuid === structureUuid;

      if (isTarget) {
        return {
          ...nodeWithoutOrder,
          children: [],
        };
      }

      if (isOnPath) {
        const filteredChildren = node.children
          .filter((child: any) => pathUuids.includes(child.uuid))
          .map((child: any) => filterTree(child, pathUuids));

        return {
          ...nodeWithoutOrder,
          children: filteredChildren,
        };
      }

      return null;
    };

    return filterTree(rootStructure, pathToRoot);
  }

  /**
   * Résolveur de structure_tree PAR REQUÊTE pour les traitements par-membre.
   *
   * Construit la `structureMap` lourde UNE SEULE FOIS (à l'appel), puis renvoie une fonction
   * pure mémoïsée par `structure_uuid` (deux membres d'une même structure → même arbre, calculé
   * une fois). Contrairement à `getStructureTreeForResponsible` (cache statique TTL partagé entre
   * requêtes/workers), les données sont TOUJOURS fraîches et l'état n'est pas partagé : à privilégier
   * pour les listes interactives. `responsibleLevelOrder` n'influence pas la sortie (la coupe se fait
   * à la structure cible) → un simple `structure_uuid` suffit.
   */
  public async createStructureTreeResolver(): Promise<
    (structureUuid: string | null | undefined) => any
  > {
    const structureMap = await this.buildStructureMapWithTotals();
    const memo = new Map<string, any>();
    return (structureUuid) => {
      if (!structureUuid || structureMap.size === 0) return null;
      if (memo.has(structureUuid)) return memo.get(structureUuid);
      const tree = this.buildFilteredTreeFromMap(structureMap, structureUuid);
      memo.set(structureUuid, tree);
      return tree;
    };
  }


  /**
   * Récupère les membres avec leur structure_tree pour l'utilisateur connecté
   */
  async getMembersWithTreeByConnectedUser(
    memberUuid: string | null,
    structureUuid: string | null,
    paginationParams?: PaginationMemberParams
  ): Promise<{
    members: any[];
    pagination: {
      current_page: number;
      per_page: number;
      total_items: number;
      total_pages: number;
      has_next: boolean;
      has_previous: boolean;
    };
  }> {

    // Vérifier que l'utilisateur a un member_uuid
    if (!memberUuid) {
      throw new NotFoundException('Utilisateur non associé à un membre');
    }

    // Récupérer le membre
    const member = await this.memberRepository.findOne({
      where: { uuid: memberUuid },
    });
    if (!member) {
      throw new NotFoundException('Utilisateur non associé à un membre');
    }

    // Utilisateur sans responsabilité (pas de structure de scope dans le JWT) :
    // on retombe sur la structure propre du membre.
    const effectiveStructureUuid = structureUuid ?? member.structure_uuid;
    if (!effectiveStructureUuid) {
      throw new NotFoundException('Structure du membre non trouvée');
    }

    // Paramètres de pagination par défaut
    const page = paginationParams?.page || 1;
    const limit = paginationParams?.limit || 25;
    const offset = (page - 1) * limit;

    // Récupérer toutes les sous-structures accessibles
    const allStructureUuids = await this.getAllSubStructureUuids(effectiveStructureUuid);

    // Construire la requête de base pour les membres
    let membersQuery = this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('structures', 's', 's.uuid = m.structure_uuid')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
      .select([
        'm.uuid AS uuid',
        'm.matricule AS matricule',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.gender AS gender',
        'm.birth_date AS birth_date',
        'm.phone AS phone',
        'm.email AS email',
        'm.structure_uuid AS structure_uuid',
        's.name AS structure_name',
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'm.division_uuid AS division_uuid',
        'div.name AS division_name',
        'm.has_gohonzon AS has_gohonzon',
        'm.membership_date AS membership_date',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL');

    // Appliquer les filtres optionnels
    if (paginationParams?.search) {
      membersQuery = membersQuery.andWhere(
        "(m.firstname LIKE :search OR m.lastname LIKE :search OR m.matricule LIKE :search OR m.phone LIKE :search OR m.email LIKE :search)",
        { search: `%${paginationParams.search}%` }
      );
    }

    if (paginationParams?.gender) {
      membersQuery = membersQuery.andWhere('m.gender = :gender', {
        gender: paginationParams.gender
      });
    }

    if (paginationParams?.has_gohonzon !== undefined) {
      membersQuery = membersQuery.andWhere('m.has_gohonzon = :hasGohonzon', {
        hasGohonzon: paginationParams.has_gohonzon
      });
    }

    if (paginationParams?.department_uuid) {
      membersQuery = membersQuery.andWhere('m.department_uuid = :deptUuid', {
        deptUuid: paginationParams.department_uuid
      });
    }

    if (paginationParams?.division_uuid) {
      membersQuery = membersQuery.andWhere('m.division_uuid = :divUuid', {
        divUuid: paginationParams.division_uuid
      });
    }

    // Compter le total pour la pagination
    const totalCount = await membersQuery.getCount();

    // Récupérer les membres paginés
    const members = await membersQuery
      .orderBy('m.firstname', 'ASC')
      .addOrderBy('m.lastname', 'ASC')
      .offset(offset)
      .limit(limit)
      .getRawMany();

    // Récupérer les responsabilités des membres paginés
    const memberUuids = members.map(m => m.uuid);
    let memberResponsibilities: any[] = [];

    if (memberUuids.length > 0) {
      memberResponsibilities = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
        .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
        .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
        .select([
          'm.uuid AS member_uuid',
          'r.uuid AS responsibility_uuid',
          'r.name AS responsibility_name',
          'r.level_uuid AS level_uuid',
          'l.name AS level_name',
          'l.order AS level_order',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();
    }

    // Grouper les responsabilités par membre
    const responsibilitiesMap = new Map<string, any[]>();
    for (const mr of memberResponsibilities) {
      if (!responsibilitiesMap.has(mr.member_uuid)) {
        responsibilitiesMap.set(mr.member_uuid, []);
      }
      responsibilitiesMap.get(mr.member_uuid)!.push({
        uuid: mr.responsibility_uuid,
        name: mr.responsibility_name,
        level_uuid: mr.level_uuid,
        level_name: mr.level_name,
        level_order: mr.level_order,
      });
    }

    // Construire les structure_tree pour chaque membre
    const memberStructureTreeMap = new Map<string, any>();

    const resolveTree = await this.createStructureTreeResolver();
    for (const m of members) {
      if (!m.structure_uuid) continue;
      // L'arbre ne dépend que de la structure du membre (le niveau de responsabilité
      // n'influence pas la coupe) → résolveur par-requête, mémoïsé par structure.
      memberStructureTreeMap.set(m.uuid, resolveTree(m.structure_uuid));
    }

    // Formater les membres avec leurs responsabilités et structure_tree
    const formattedMembers = members.map(m => ({
      uuid: m.uuid,
      matricule: m.matricule,
      firstname: m.firstname,
      lastname: m.lastname,
      gender: m.gender,
      birth_date: m.birth_date,
      phone: m.phone,
      email: m.email,
      structure_uuid: m.structure_uuid,
      structure_name: m.structure_name,
      department_uuid: m.department_uuid,
      department_name: m.department_name,
      division_uuid: m.division_uuid,
      division_name: m.division_name,
      has_gohonzon: m.has_gohonzon,
      membership_date: m.membership_date,
      responsibilities: responsibilitiesMap.get(m.uuid) || [],
      structure_tree: memberStructureTreeMap.get(m.uuid) || null,
    }));

    // Calculer les infos de pagination
    const totalPages = Math.ceil(totalCount / limit);

    return {
      members: formattedMembers,
      pagination: {
        current_page: page,
        per_page: limit,
        total_items: totalCount,
        total_pages: totalPages,
        has_next: page < totalPages,
        has_previous: page > 1,
      },
    };
  }

  async getBeneficiaryByConnectedUser(
    memberUuid: string | null,
    structureUuid: string | null,
    levelUuid: string | null,
    filterParams?: {
      search?: string;
      gender?: 'homme' | 'femme';
      has_gohonzon?: boolean;
      department_uuid?: string;
      division_uuid?: string;
    }
  ): Promise<any[]> {

    // Vérifier que l'utilisateur a un member_uuid
    if (!memberUuid) {
      throw new NotFoundException('Utilisateur non associé à un membre');
    }

    // Récupérer le membre
    const member = await this.memberRepository.findOne({
      where: { uuid: memberUuid },
    });

    if (!member || !structureUuid) {
      throw new NotFoundException('Structure du membre non trouvée');
    }

    if (!levelUuid) {
      throw new NotFoundException('niveau du membre non trouvée')
    }

    const check_level = await this.levelRepository.findOne({ where: { uuid: levelUuid } });


    // Pour les niveaux <= 3, retourner uniquement les infos du membre connecté
    if (check_level && check_level.order <= 3) {
      // Récupérer les informations complètes du membre avec les jointures
      const memberInfo = await this.memberRepository
        .createQueryBuilder('m')
        .leftJoin('structures', 's', 's.uuid = m.structure_uuid')
        .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
        .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
        .select([
          'm.uuid AS uuid',
          'm.matricule AS matricule',
          'm.firstname AS firstname',
          'm.lastname AS lastname',
          'm.gender AS gender',
          'm.birth_date AS birth_date',
          'm.phone AS phone',
          'm.email AS email',
          'm.structure_uuid AS structure_uuid',
          's.name AS structure_name',
          'm.department_uuid AS department_uuid',
          'd.name AS department_name',
          'm.division_uuid AS division_uuid',
          'div.name AS division_name',
          'm.has_gohonzon AS has_gohonzon',
          'm.membership_date AS membership_date',
        ])
        .where('m.uuid = :memberUuid', { memberUuid })
        .andWhere('m.deleted_at IS NULL')
        .getRawOne();

      if (!memberInfo) {
        throw new NotFoundException('Membre non trouvé');
      }

      // Retourner dans un tableau pour respecter le type de retour
      return [memberInfo];
    }

    // Récupérer toutes les sous-structures accessibles
    const allStructureUuids = await this.getAllSubStructureUuids(structureUuid);

    // Construire la requête de base pour les membres
    let membersQuery = this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('structures', 's', 's.uuid = m.structure_uuid')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
      .select([
        'm.uuid AS uuid',
        'm.matricule AS matricule',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.gender AS gender',
        'm.birth_date AS birth_date',
        'm.phone AS phone',
        'm.email AS email',
        'm.structure_uuid AS structure_uuid',
        's.name AS structure_name',
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'm.division_uuid AS division_uuid',
        'div.name AS division_name',
        'm.has_gohonzon AS has_gohonzon',
        'm.membership_date AS membership_date',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL');

    // Appliquer les filtres optionnels
    if (filterParams?.search) {
      membersQuery = membersQuery.andWhere(
        "(m.firstname LIKE :search OR m.lastname LIKE :search OR m.matricule LIKE :search OR m.phone LIKE :search OR m.email LIKE :search)",
        { search: `%${filterParams.search}%` }
      );
    }

    if (filterParams?.gender) {
      membersQuery = membersQuery.andWhere('m.gender = :gender', {
        gender: filterParams.gender
      });
    }

    if (filterParams?.has_gohonzon !== undefined) {
      membersQuery = membersQuery.andWhere('m.has_gohonzon = :hasGohonzon', {
        hasGohonzon: filterParams.has_gohonzon
      });
    }

    if (filterParams?.department_uuid) {
      membersQuery = membersQuery.andWhere('m.department_uuid = :deptUuid', {
        deptUuid: filterParams.department_uuid
      });
    }

    if (filterParams?.division_uuid) {
      membersQuery = membersQuery.andWhere('m.division_uuid = :divUuid', {
        divUuid: filterParams.division_uuid
      });
    }

    // Récupérer tous les membres (sans pagination)
    const members = await membersQuery
      .orderBy('m.firstname', 'ASC')
      .addOrderBy('m.lastname', 'ASC')
      .getRawMany();

    // Récupérer les responsabilités des membres
    const memberUuids = members.map(m => m.uuid);
    let memberResponsibilities: any[] = [];

    if (memberUuids.length > 0) {
      memberResponsibilities = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
        .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
        .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
        .select([
          'm.uuid AS member_uuid',
          'r.uuid AS responsibility_uuid',
          'r.name AS responsibility_name',
          'r.level_uuid AS level_uuid',
          'l.name AS level_name',
          'l.order AS level_order',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();
    }

    // Grouper les responsabilités par membre
    const responsibilitiesMap = new Map<string, any[]>();
    for (const mr of memberResponsibilities) {
      if (!responsibilitiesMap.has(mr.member_uuid)) {
        responsibilitiesMap.set(mr.member_uuid, []);
      }
      responsibilitiesMap.get(mr.member_uuid)!.push({
        uuid: mr.responsibility_uuid,
        name: mr.responsibility_name,
        level_uuid: mr.level_uuid,
        level_name: mr.level_name,
        level_order: mr.level_order,
      });
    }

    // Construire les structure_tree pour chaque membre
    const memberStructureTreeMap = new Map<string, any>();

    const resolveTree = await this.createStructureTreeResolver();
    for (const m of members) {
      if (!m.structure_uuid) continue;
      // L'arbre ne dépend que de la structure du membre (le niveau de responsabilité
      // n'influence pas la coupe) → résolveur par-requête, mémoïsé par structure.
      memberStructureTreeMap.set(m.uuid, resolveTree(m.structure_uuid));
    }

    // Formater les membres avec leurs responsabilités et structure_tree
    const formattedMembers = members.map(m => ({
      uuid: m.uuid,
      matricule: m.matricule,
      firstname: m.firstname,
      lastname: m.lastname,
      gender: m.gender,
      birth_date: m.birth_date,
      phone: m.phone,
      email: m.email,
      structure_uuid: m.structure_uuid,
      structure_name: m.structure_name,
      department_uuid: m.department_uuid,
      department_name: m.department_name,
      division_uuid: m.division_uuid,
      division_name: m.division_name,
      has_gohonzon: m.has_gohonzon,
      membership_date: m.membership_date,
      //responsibilities: responsibilitiesMap.get(m.uuid) || [],
      //structure_tree: memberStructureTreeMap.get(m.uuid) || null,
    }));

    return formattedMembers;
  }

  async exportMembersToExcel(
    memberUuid: string | null,
    structureUuid: string | null,
    res: Response,
    filterParams?: {
      search?: string;
      gender?: 'homme' | 'femme';
      has_gohonzon?: boolean;
      region_uuid?: string;
      centre_uuid?: string;
      chapitre_uuid?: string;
      disctrict_uuid?: string;
      group_uuid?: string;
      department_uuid?: string;
      division_uuid?: string;

    }
  ): Promise<void> {

    // Vérifier que l'utilisateur a un member_uuid
    if (!memberUuid) {
      throw new NotFoundException('Utilisateur non associé à un membre');
    }

    // Récupérer le membre
    const member = await this.memberRepository.findOne({
      where: { uuid: memberUuid },
    });

    if (!member || !structureUuid) {
      throw new NotFoundException('Structure du membre non trouvée');
    }

    // Récupérer toutes les sous-structures accessibles
    const allStructureUuids = await this.getAllSubStructureUuids(structureUuid);

    // Construire la requête de base pour les membres
    let membersQuery = this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('structures', 's', 's.uuid = m.structure_uuid')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
      .select([
        'm.uuid AS uuid',
        'm.matricule AS matricule',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.gender AS gender',
        'm.birth_date AS birth_date',
        'm.phone AS phone',
        'm.email AS email',
        'm.structure_uuid AS structure_uuid',
        's.name AS structure_name',
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'm.division_uuid AS division_uuid',
        'div.name AS division_name',
        'm.has_gohonzon AS has_gohonzon',
        'm.membership_date AS membership_date',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL');

    // Appliquer les filtres optionnels
    if (filterParams?.search) {
      membersQuery = membersQuery.andWhere(
        "(m.firstname LIKE :search OR m.lastname LIKE :search OR m.matricule LIKE :search OR m.phone LIKE :search OR m.email LIKE :search)",
        { search: `%${filterParams.search}%` }
      );
    }

    if (filterParams?.gender) {
      membersQuery = membersQuery.andWhere('m.gender = :gender', {
        gender: filterParams.gender
      });
    }

    if (filterParams?.has_gohonzon !== undefined) {
      membersQuery = membersQuery.andWhere('m.has_gohonzon = :hasGohonzon', {
        hasGohonzon: filterParams.has_gohonzon
      });
    }

    if (filterParams?.department_uuid) {
      membersQuery = membersQuery.andWhere('m.department_uuid = :deptUuid', {
        deptUuid: filterParams.department_uuid
      });
    }

    if (filterParams?.division_uuid) {
      membersQuery = membersQuery.andWhere('m.division_uuid = :divUuid', {
        divUuid: filterParams.division_uuid
      });
    }

    // Récupérer tous les membres (sans pagination)
    const members = await membersQuery
      .orderBy('m.firstname', 'ASC')
      .addOrderBy('m.lastname', 'ASC')
      .getRawMany();

    // Récupérer les responsabilités des membres
    const memberUuids = members.map(m => m.uuid);
    let memberResponsibilities: any[] = [];

    if (memberUuids.length > 0) {
      memberResponsibilities = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
        .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
        .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
        .select([
          'm.uuid AS member_uuid',
          'r.uuid AS responsibility_uuid',
          'r.name AS responsibility_name',
          'r.level_uuid AS level_uuid',
          'l.name AS level_name',
          'l.order AS level_order',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();
    }

    // Grouper les responsabilités par membre
    const responsibilitiesMap = new Map<string, any[]>();
    for (const mr of memberResponsibilities) {
      if (!responsibilitiesMap.has(mr.member_uuid)) {
        responsibilitiesMap.set(mr.member_uuid, []);
      }
      responsibilitiesMap.get(mr.member_uuid)!.push({
        uuid: mr.responsibility_uuid,
        name: mr.responsibility_name,
        level_uuid: mr.level_uuid,
        level_name: mr.level_name,
        level_order: mr.level_order,
      });
    }

    // Construire les structure_tree pour chaque membre
    const memberStructureTreeMap = new Map<string, any>();

    for (const m of members) {
      if (!m.structure_uuid) continue;

      const memberResponsibilitiesList = responsibilitiesMap.get(m.uuid) || [];

      if (memberResponsibilitiesList.length > 0) {
        const validResponsibilities = memberResponsibilitiesList.filter(r => r.level_order !== null);

        if (validResponsibilities.length > 0) {
          const highestLevelOrder = Math.min(
            ...validResponsibilities.map(r => parseInt(r.level_order))
          );

          const tree = await this.getStructureTreeForResponsible(
            m.structure_uuid,
            highestLevelOrder
          );

          memberStructureTreeMap.set(m.uuid, tree);
        } else {
          const tree = await this.getStructureTreeForResponsible(
            m.structure_uuid,
            999
          );
          memberStructureTreeMap.set(m.uuid, tree);
        }
      } else {
        const tree = await this.getStructureTreeForResponsible(
          m.structure_uuid,
          999
        );
        memberStructureTreeMap.set(m.uuid, tree);
      }
    }

    // Fonction helper pour extraire les level_names et les structure_names (en sautant le premier niveau)
    const flattenStructureTree = (tree: any, skipFirst = true): { levelNames: string[], structureNames: string[] } => {
      const levelNames: string[] = [];
      const structureNames: string[] = [];

      if (tree) {
        // Si skipFirst est true, on saute le premier niveau "Inconnu"
        if (!skipFirst) {
          levelNames.push(tree.level_name || '');
          structureNames.push(tree.name || '');
        }

        if (tree.children && tree.children.length > 0) {
          tree.children.forEach((child: any) => {
            const childResults = flattenStructureTree(child, false); // Ne sauter que le premier
            levelNames.push(...childResults.levelNames);
            structureNames.push(...childResults.structureNames);
          });
        }
      }

      return { levelNames, structureNames };
    };

    // Récupérer un arbre exemple pour déterminer les noms de niveaux (en sautant le premier)
    const sampleTree = memberStructureTreeMap.values().next().value;
    const { levelNames: structureLevelNames } = sampleTree ? flattenStructureTree(sampleTree, true) : { levelNames: [] };

    // Créer le workbook Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Membres');

    // Définir les colonnes de base
    const baseColumns = [
      { header: 'Matricule', key: 'matricule', width: 15 },
      { header: 'Nom', key: 'firstname', width: 20 },
      { header: 'Prénom', key: 'lastname', width: 20 },
      { header: 'Genre', key: 'gender', width: 10 },
      { header: 'Date de naissance', key: 'birth_date', width: 15 },
      { header: 'Téléphone', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Département', key: 'department_name', width: 20 },
      { header: 'Division', key: 'division_name', width: 20 },
      { header: 'Gohonzon', key: 'has_gohonzon', width: 12 },
      { header: 'Date adhésion', key: 'membership_date', width: 15 },
      { header: 'Responsabilités', key: 'responsibilities', width: 40 },
    ];

    // Ajouter les colonnes pour la structure tree avec les level_names (sans le premier niveau)
    const structureTreeColumns: { header: string; key: string; width: number }[] = [];

    structureLevelNames.forEach((levelName: string, index: number) => {
      structureTreeColumns.push({
        header: levelName || `Structure Niveau ${index + 1}`,
        key: `structure_level_${index}`,
        width: 25,
      });
    });

    worksheet.columns = [...baseColumns, ...structureTreeColumns];

    // Styliser l'en-tête
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Ajouter les données avec structure tree (en sautant le premier niveau)
    members.forEach(member => {
      const responsibilities = responsibilitiesMap.get(member.uuid) || [];
      const responsibilitiesText = responsibilities
        .map(r => `${r.name} (${r.level_name})`)
        .join(', ');

      // Récupérer et aplatir la structure tree (en sautant le premier niveau)
      const tree = memberStructureTreeMap.get(member.uuid);
      const { structureNames: treeFlattened } = tree ? flattenStructureTree(tree, true) : { structureNames: [] };

      // Construire l'objet row
      const rowData: any = {
        matricule: member.matricule || '',
        lastname: member.lastname || '',
        firstname: member.firstname || '',
        gender: member.gender || '',
        birth_date: member.birth_date ? new Date(member.birth_date).toLocaleDateString('fr-FR') : '',
        phone: member.phone || '',
        email: member.email || '',
        department_name: member.department_name || '',
        division_name: member.division_name || '',
        has_gohonzon: member.has_gohonzon ? 'Oui' : 'Non',
        membership_date: member.membership_date ? new Date(member.membership_date).toLocaleDateString('fr-FR') : '',
        responsibilities: responsibilitiesText || '',
      };

      // Ajouter les niveaux de structure (les NOMS des structures, sans le premier niveau)
      structureLevelNames.forEach((levelName: string, index: number) => {
        rowData[`structure_level_${index}`] = treeFlattened[index] || '';
      });

      worksheet.addRow(rowData);
    });

    // Appliquer des bordures à toutes les cellules
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    // Générer le fichier Excel
    const fileName = `${new Date().toISOString().split('T')[0]}.xlsx`;

    // Envoyer directement au client
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  }

  /**
   * Récupère récursivement tous les UUIDs des sous-structures
   */
  public async getAllSubStructureUuids(structureUuid: string): Promise<string[]> {
    // ⚠ Anciennement récursif (1 requête SQL par nœud, en série) → des MILLIERS de
    // requêtes pour un palier haut (~3600 structures) → 60 s+ et timeout passerelle.
    // Ici : UNE seule requête (uuid + parent_uuid de toutes les structures) puis
    // parcours du sous-arbre en mémoire (BFS itératif, avec garde anti-cycle).
    const all = await this.structureRepository.find({
      select: ['uuid', 'parent_uuid'],
    });

    const childrenByParent = new Map<string, string[]>();
    for (const s of all) {
      const parent =
        s.parent_uuid && s.parent_uuid.trim() !== '' ? s.parent_uuid : null;
      if (!parent) continue;
      const bucket = childrenByParent.get(parent);
      if (bucket) bucket.push(s.uuid);
      else childrenByParent.set(parent, [s.uuid]);
    }

    const result: string[] = [];
    const seen = new Set<string>();
    const stack: string[] = [structureUuid];
    while (stack.length > 0) {
      const uuid = stack.pop() as string;
      if (seen.has(uuid)) continue; // garde anti-cycle (données héritées)
      seen.add(uuid);
      result.push(uuid);
      const kids = childrenByParent.get(uuid);
      if (kids) stack.push(...kids);
    }

    return result;
  }

  /**
   * Totaux par département
   */
  private async getDepartmentsSummary(
    structureUuids: string[],
    totalMembers: number
  ): Promise<{ uuid: string; name: string; total: number; percentage: number }[]> {
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
   * Totaux par division
   */
  private async getDivisionsSummary(
    structureUuids: string[],
    totalMembers: number
  ): Promise<{ uuid: string; name: string; department_uuid: string; department_name: string; total: number; percentage: number }[]> {
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



  async getMemberStatsByConnectedUser(
    memberUuid: string | null,
    responsibility_structure_uuid: string | null,
    filters?: MemberStatsFilters
  ): Promise<MemberStatsResponse> {

    // Vérifier que l'utilisateur a un member_uuid
    if (!memberUuid) {
      throw new NotFoundException('Utilisateur non associé à un membre');
    }

    // Récupérer le membre
    const member = await this.memberRepository.findOne({
      where: { uuid: memberUuid },
    });

    if (!member) {
      throw new NotFoundException('Utilisateur non associé à un membre');
    }

    // Utilisateur sans responsabilité : repli sur la structure propre du membre.
    const memberStructureUuid =
      responsibility_structure_uuid ?? member.structure_uuid;
    if (!memberStructureUuid) {
      throw new NotFoundException('Structure du membre non trouvée');
    }

    // 1. Déterminer la structure de base selon les filtres
    //    (du plus spécifique au plus général : sous-groupe → … → centre régional → région)
    let targetStructureUuid = memberStructureUuid;

    if (filters?.sous_groupe_uuid) {
      targetStructureUuid = filters.sous_groupe_uuid;
    } else if (filters?.groupe_uuid) {
      targetStructureUuid = filters.groupe_uuid;
    } else if (filters?.district_uuid) {
      targetStructureUuid = filters.district_uuid;
    } else if (filters?.chapitre_uuid) {
      targetStructureUuid = filters.chapitre_uuid;
    } else if (filters?.centre_uuid) {
      targetStructureUuid = filters.centre_uuid;
    } else if (filters?.centre_regional_uuid) {
      targetStructureUuid = filters.centre_regional_uuid;
    } else if (filters?.region_uuid) {
      targetStructureUuid = filters.region_uuid;
    }

    // 2. Vérifier que la structure cible existe
    const targetStructure = await this.structureRepository.findOne({
      where: { uuid: targetStructureUuid },
    });

    if (!targetStructure) {
      throw new NotFoundException('Structure non trouvée');
    }

    // 3. Récupérer les sous-structures de la cible
    const targetSubStructures = await this.getAllSubStructureUuids(targetStructureUuid);

    // 4. Construire le breadcrumb (chemin hiérarchique)
    const breadcrumb = await this.buildBreadcrumb(targetStructureUuid);

    // 5. Récupérer les filtres disponibles (basés sur la structure du membre)
    const filtersAvailable = await this.getAvailableFilters(memberStructureUuid, filters);

    // 6. Construire la requête pour les membres
    let membersQuery = this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
      .where('m.structure_uuid IN (:...uuids)', { uuids: targetSubStructures })
      .andWhere('m.deleted_at IS NULL');

    // Appliquer les filtres département/division
    if (filters?.department_uuid) {
      membersQuery = membersQuery.andWhere('m.department_uuid = :deptUuid', {
        deptUuid: filters.department_uuid,
      });
    }

    if (filters?.division_uuid) {
      membersQuery = membersQuery.andWhere('m.division_uuid = :divUuid', {
        divUuid: filters.division_uuid,
      });
    }

    // 7. Récupérer les membres
    const members = await membersQuery
      .select([
        'm.uuid AS uuid',
        'm.gender AS gender',
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'm.division_uuid AS division_uuid',
        'div.name AS division_name',
      ])
      .getRawMany();

    // 8. Calculer les statistiques
    const totalMembers = members.length;
    const totalHommes = members.filter(m => m.gender === 'homme').length;
    const totalFemmes = members.filter(m => m.gender === 'femme').length;

    // Stats par département
    const deptHommes = members.filter(m =>
      m.department_name?.toLowerCase().includes('homme') &&
      !m.department_name?.toLowerCase().includes('jeune')
    ).length;

    const deptFemmes = members.filter(m =>
      m.department_name?.toLowerCase().includes('femme') &&
      !m.department_name?.toLowerCase().includes('jeune')
    ).length;

    const deptJeunesse = members.filter(m =>
      m.department_name?.toLowerCase().includes('jeune') ||
      m.department_name?.toLowerCase().includes('jeunesse')
    ).length;

    // Stats par division
    const divJeuneHomme = members.filter(m =>
      m.division_name?.toLowerCase().includes('jeune') &&
      m.division_name?.toLowerCase().includes('homme')
    ).length;

    const divJeuneFemme = members.filter(m =>
      m.division_name?.toLowerCase().includes('jeune') &&
      m.division_name?.toLowerCase().includes('femme')
    ).length;

    const divAvenir = members.filter(m =>
      m.division_name?.toLowerCase().includes('avenir')
    ).length;

    // 9. Retourner le résultat
    return {
      filters_available: filtersAvailable,
      stats: {
        total_members: totalMembers,
        total_hommes: totalHommes,
        total_femmes: totalFemmes,
        departments: {
          total: deptHommes + deptFemmes + deptJeunesse,
          hommes: deptHommes,
          femmes: deptFemmes,
          jeunesse: deptJeunesse,
          stats: {
            percent_man: deptHommes + deptFemmes + deptJeunesse > 0
              ? parseFloat(((deptHommes / (deptHommes + deptFemmes + deptJeunesse)) * 100).toFixed(2))
              : 0,
            percent_woman: deptHommes + deptFemmes + deptJeunesse > 0
              ? parseFloat(((deptFemmes / (deptHommes + deptFemmes + deptJeunesse)) * 100).toFixed(2))
              : 0,
            percent_young: deptHommes + deptFemmes + deptJeunesse > 0
              ? parseFloat(((deptJeunesse / (deptHommes + deptFemmes + deptJeunesse)) * 100).toFixed(2))
              : 0,
          }
        },
        divisions: {
          total: divJeuneHomme + divJeuneFemme + divAvenir,
          jeune_homme: divJeuneHomme,
          jeune_femme: divJeuneFemme,
          avenir: divAvenir,
          stats: {
            percent_man: divJeuneHomme + divJeuneFemme + divAvenir > 0
              ? parseFloat(((divJeuneHomme / (divJeuneHomme + divJeuneFemme + divAvenir)) * 100).toFixed(2))
              : 0,
            percent_woman: divJeuneHomme + divJeuneFemme + divAvenir > 0
              ? parseFloat(((divJeuneFemme / (divJeuneHomme + divJeuneFemme + divAvenir)) * 100).toFixed(2))
              : 0,
            percent_young: divJeuneHomme + divJeuneFemme + divAvenir > 0
              ? parseFloat(((divAvenir / (divJeuneHomme + divJeuneFemme + divAvenir)) * 100).toFixed(2))
              : 0,
          }
        },
      },
      breadcrumb,
    };
  }
  /**
   * Récupère toutes les structures accessibles (parents + enfants)
   */
  private async getAllAccessibleStructures(structureUuid: string): Promise<string[]> {
    const result: string[] = [];

    // Récupérer tous les parents (remonter jusqu'à la racine)
    let currentUuid: string | null = structureUuid;

    while (currentUuid) {
      result.push(currentUuid);
      const structure = await this.structureRepository.findOne({
        where: { uuid: currentUuid },
      });
      currentUuid = structure?.parent_uuid ?? null;
    }

    // Récupérer tous les enfants (descendre récursivement)
    const children = await this.getAllSubStructureUuids(structureUuid);

    // Fusionner sans doublons
    for (const child of children) {
      if (!result.includes(child)) {
        result.push(child);
      }
    }

    return result;
  }


  /**
   * Construit le breadcrumb (chemin hiérarchique) d'une structure
   */
  private async buildBreadcrumb(structureUuid: string): Promise<any> {
    const breadcrumb: any = {};

    // Récupérer la structure et remonter jusqu'à la racine
    let currentUuid: string | null = structureUuid;

    while (currentUuid) {
      const structure = await this.structureRepository.findOne({
        where: { uuid: currentUuid },
      });

      if (!structure) break;

      let level: LevelEntity | null = null;
      if (structure.level_uuid) {
        level = await this.levelRepository.findOne({
          where: { uuid: structure.level_uuid },
        });
      }

      const levelName = level?.name?.toUpperCase();

      if (levelName === 'REGION') {
        breadcrumb.region = { uuid: structure.uuid, name: structure.name };
      } else if (levelName === 'CENTRE_REGIONAL') {
        breadcrumb.centre_regional = { uuid: structure.uuid, name: structure.name };
      } else if (levelName === 'CENTRE') {
        breadcrumb.centre = { uuid: structure.uuid, name: structure.name };
      } else if (levelName === 'CHAPITRE') {
        breadcrumb.chapitre = { uuid: structure.uuid, name: structure.name };
      } else if (levelName === 'DISTRICT') {
        breadcrumb.district = { uuid: structure.uuid, name: structure.name };
      } else if (levelName === 'GROUPE') {
        breadcrumb.groupe = { uuid: structure.uuid, name: structure.name };
      } else if (levelName === 'SOUS_GROUPE') {
        breadcrumb.sous_groupe = { uuid: structure.uuid, name: structure.name };
      }

      currentUuid = structure.parent_uuid ?? null;
    }

    return breadcrumb;
  }

  /**
   * Récupère les filtres disponibles basés sur la structure du membre
   */
  private async getAvailableFilters(
    memberStructureUuid: string,
    currentFilters?: MemberStatsFilters
  ): Promise<any> {
    const allStructureUuids = await this.getAllSubStructureUuids(memberStructureUuid);

    // Récupérer toutes les structures accessibles avec leur niveau
    const structures = await this.structureRepository
      .createQueryBuilder('s')
      .leftJoin('levels', 'l', 'l.uuid = s.level_uuid')
      .select([
        's.uuid AS uuid',
        's.name AS name',
        's.parent_uuid AS parent_uuid',
        'l.name AS level_name',
      ])
      .where('s.uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('s.deleted_at IS NULL')
      .orderBy('s.name', 'ASC')
      .getRawMany();

    const filters = {
      regions: [] as { uuid: string; name: string }[],
      centre_regionaux: [] as { uuid: string; name: string }[],
      centres: [] as { uuid: string; name: string }[],
      chapitres: [] as { uuid: string; name: string }[],
      districts: [] as { uuid: string; name: string }[],
      groupes: [] as { uuid: string; name: string }[],
    };

    // Centre Régional est un palier intermédiaire entre Région et Centre.
    // On mappe chaque Centre Régional vers sa région pour que le filtre « région »
    // continue de lister les bons centres (dont le parent direct est désormais un CR).
    const crToRegion = new Map<string, string>();
    for (const s of structures) {
      if (s.level_name?.toUpperCase() === 'CENTRE_REGIONAL') {
        crToRegion.set(s.uuid, s.parent_uuid);
      }
    }

    for (const s of structures) {
      const levelName = s.level_name?.toUpperCase();
      const item = { uuid: s.uuid, name: s.name };

      if (levelName === 'REGION') {
        filters.regions.push(item);
      } else if (levelName === 'CENTRE_REGIONAL') {
        // Filtrer par région si sélectionnée
        if (!currentFilters?.region_uuid || s.parent_uuid === currentFilters.region_uuid) {
          filters.centre_regionaux.push(item);
        }
      } else if (levelName === 'CENTRE') {
        // Le parent direct d'un Centre est maintenant un Centre Régional.
        // On respecte le filtre Centre Régional s'il est fourni, sinon le filtre Région (via le CR parent).
        const okCentreRegional =
          !currentFilters?.centre_regional_uuid || s.parent_uuid === currentFilters.centre_regional_uuid;
        const okRegion =
          !currentFilters?.region_uuid || crToRegion.get(s.parent_uuid) === currentFilters.region_uuid;
        if (okCentreRegional && okRegion) {
          filters.centres.push(item);
        }
      } else if (levelName === 'CHAPITRE') {
        // Filtrer par centre si sélectionné
        if (!currentFilters?.centre_uuid || s.parent_uuid === currentFilters.centre_uuid) {
          filters.chapitres.push(item);
        }
      } else if (levelName === 'DISTRICT') {
        // Filtrer par chapitre si sélectionné
        if (!currentFilters?.chapitre_uuid || s.parent_uuid === currentFilters.chapitre_uuid) {
          filters.districts.push(item);
        }
      } else if (levelName === 'GROUPE') {
        // Filtrer par district si sélectionné
        if (!currentFilters?.district_uuid || s.parent_uuid === currentFilters.district_uuid) {
          filters.groupes.push(item);
        }
      }
    }

    return filters;
  }

  async downloadMembersExport(jobUuid: string, user_uuid: string) {
    const job = await this.exportJobService.getJob(jobUuid);

    if (job.user_uuid !== user_uuid) {
      //throw new ForbiddenException('Vous n\'avez pas accès à ce fichier');
    }

    if (job.status !== ExportJobStatus.COMPLETED) {
      throw new BadRequestException(`Export pas encore terminé (statut: ${job.status})`);
    }

    if (!job.file_path || !fs.existsSync(job.file_path)) {
      throw new NotFoundException('Fichier d\'export introuvable');
    }

    const buffer = fs.readFileSync(job.file_path);

    return {
      buffer,
      filename: job.file_name,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  async getExportJobStatus(jobId: string) {
    const job = await this.exportJobService.getJob(jobId);

    return {
      jobId: job.uuid,
      status: job.status,
      progress: job.progress,
      fileName: job.file_name,
      downloadUrl: job.file_name ? `/members/async-exports/download/${job.uuid}` : null,
      errorMessage: job.error_message,
      createdAt: job.created_at,
    };
  }

  // src/member/member.service.ts ou payment.service.ts


  async queueMembersExport(
    member_uuid: string,
    structure_uuid: string,
    filterParams: any,
    user_uuid: string,
  ) {
    // Créer le job
    const job = await this.exportJobService.createJob(
      'members',
      {
        member_uuid,
        structure_uuid,
        filterParams
      },
      user_uuid,
    );

    //  Lancer le traitement en arrière-plan AVEC le workbook
    setImmediate(async () => {
      try {
        // Gestion des filtres de structure
        let baseStructureUuid = structure_uuid;

        if (filterParams?.region_uuid) baseStructureUuid = filterParams.region_uuid;
        if (filterParams?.centre_regional_uuid) baseStructureUuid = filterParams.centre_regional_uuid;
        if (filterParams?.centre_uuid) baseStructureUuid = filterParams.centre_uuid;
        if (filterParams?.chapitre_uuid) baseStructureUuid = filterParams.chapitre_uuid;
        if (filterParams?.district_uuid) baseStructureUuid = filterParams.district_uuid;
        if (filterParams?.groupe_uuid) baseStructureUuid = filterParams.groupe_uuid;
        if (filterParams?.sous_groupe_uuid) baseStructureUuid = filterParams.sous_groupe_uuid;

        await this.exportJobService.updateJobProgress(job.uuid, 30);

        //  Générer le workbook ICI (dans le même service)
        const workbook = await this.generateMembersWorkbook(
          member_uuid,
          baseStructureUuid,
          filterParams,
        );

        await this.exportJobService.updateJobProgress(job.uuid, 60);

        const file_name = await this.generateExportFileName(baseStructureUuid, filterParams);

        //  Passer le workbook au processor
        await this.exportProcessorService.processMembersExport(job.uuid, workbook,file_name);

      } catch (error) {
        console.error('Export members error:', error);
        await this.exportJobService.updateJobStatus(
          job.uuid,
          ExportJobStatus.FAILED,
          error.message
        );
      }
    });

    return {
      success: true,
      message: 'Export des membres en cours de traitement',
      jobId: job.uuid,
      checkStatusUrl: `/members/export/status/${job.uuid}`,
    };
  }

  // Méthode existante qui utilise generateMembersWorkbook
  async asyncExportMembersToExcel(
    memberUuid: string,
    structureUuid: string,
    res: Response,
    filterParams?: any,
  ): Promise<void> {
    const workbook = await this.generateMembersWorkbook(
      memberUuid,
      structureUuid,
      filterParams,
    );

    const fileName = `${new Date().toISOString().split('T')[0]}.xlsx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await workbook.xlsx.write(res);
    res.end();
  }



  async generateMembersWorkbook(
  memberUuid: string,
  structureUuid: string,
  filterParams?: {
    search?: string;
    gender?: 'homme' | 'femme';
    has_gohonzon?: boolean;
    region_uuid?: string;
    centre_uuid?: string;
    chapitre_uuid?: string;
    district_uuid?: string;
    groupe_uuid?: string;
    department_uuid?: string;
    division_uuid?: string;
  }
): Promise<ExcelJS.Workbook> {
  // Vérifier que l'utilisateur a un member_uuid
  if (!memberUuid) {
    throw new NotFoundException('Utilisateur non associé à un membre');
  }

  const member = await this.memberRepository.findOne({
    where: { uuid: memberUuid },
  });

  if (!member || !structureUuid) {
    throw new NotFoundException('Structure du membre non trouvée');
  }

  // Récupérer toutes les sous-structures accessibles
  const allStructureUuids = await this.getAllSubStructureUuids(structureUuid);

  // Construire la requête de base pour les membres
  let membersQuery = this.memberRepository
    .createQueryBuilder('m')
    .leftJoin('structures', 's', 's.uuid = m.structure_uuid')
    .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
    .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
    .leftJoin('civilities', 'c', 'c.uuid = m.civility_uuid')
    .leftJoin('marital_status', 'ms', 'ms.uuid = m.marital_status_uuid')
    .leftJoin('countries', 'ctry', 'ctry.uuid = m.country_uuid')
    .leftJoin('cities', 'city', 'city.uuid = m.city_uuid')
    .leftJoin('formations', 'f', 'f.uuid = m.formation_uuid')
    .leftJoin('jobs', 'j', 'j.uuid = m.job_uuid')
    .leftJoin('organisation_cities', 'oc', 'oc.uuid = m.organisation_city_uuid')
    .select([
      'm.uuid AS uuid',
      'm.matricule AS matricule',
      'm.firstname AS firstname',
      'm.lastname AS lastname',
      'm.civility_uuid AS civility_uuid',
      'c.name AS civility_name',
      'm.marital_status_uuid AS marital_status_uuid',
      'ms.name AS marital_status_name',
      'm.country_uuid AS country_uuid',
      'ctry.name AS country_name',
      'm.city_uuid AS city_uuid',
      'city.name AS city_name',
      'm.formation_uuid AS formation_uuid',
      'f.name AS formation_name',
      'm.job_uuid AS job_uuid',
      'j.name AS job_name',
      'm.organisation_city_uuid AS organisation_city_uuid',
      'oc.name AS organisation_city',
      'm.gender AS gender',
      'm.birth_date AS birth_date',
      'm.phone AS phone',
      'm.phone_whatsapp AS phone_whatsapp',
      'm.email AS email',
      'm.structure_uuid AS structure_uuid',
      's.name AS structure_name',
      'm.department_uuid AS department_uuid',
      'd.name AS department_name',
      'm.division_uuid AS division_uuid',
      'div.name AS division_name',
      'm.has_gohonzon AS has_gohonzon',
      'm.membership_date AS membership_date',
      'm.sokahan_byakuren AS sokahan_byakuren',
      'm.spouse_name AS spouse_name',
      'm.spouse_member AS spouse_member',
      'm.childrens AS childrens',
      'm.tutor_name AS tutor_name',
      'm.tutor_phone AS tutor_phone',
      'm.has_tokusso AS has_tokusso',
      'm.date_tokusso AS date_tokusso',
      'm.has_omamori AS has_omamori',
      'm.date_omamori AS date_omamori',
      'm.longitude AS longitude',
      'm.latitude AS latitude',
    ])
    .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
    .andWhere('m.deleted_at IS NULL');

  // Appliquer les filtres
  if (filterParams?.search) {
    membersQuery = membersQuery.andWhere(
      "(LOWER(m.firstname) LIKE LOWER(:search) OR LOWER(m.lastname) LIKE LOWER(:search) OR LOWER(m.matricule) LIKE LOWER(:search) OR LOWER(m.phone) LIKE LOWER(:search) OR LOWER(m.email) LIKE LOWER(:search))",
      { search: `%${filterParams.search}%` }
    );
  }

  if (filterParams?.gender) {
    membersQuery = membersQuery.andWhere('m.gender = :gender', {
      gender: filterParams.gender
    });
  }

  if (filterParams?.has_gohonzon !== undefined) {
    membersQuery = membersQuery.andWhere('m.has_gohonzon = :hasGohonzon', {
      hasGohonzon: filterParams.has_gohonzon
    });
  }

  if (filterParams?.department_uuid) {
    membersQuery = membersQuery.andWhere('m.department_uuid = :deptUuid', {
      deptUuid: filterParams.department_uuid
    });
  }

  if (filterParams?.division_uuid) {
    membersQuery = membersQuery.andWhere('m.division_uuid = :divUuid', {
      divUuid: filterParams.division_uuid
    });
  }

  // Récupérer tous les membres (sans pagination)
  const members = await membersQuery
    .orderBy('m.firstname', 'ASC')
    .addOrderBy('m.lastname', 'ASC')
    .getRawMany();

  // Récupérer TOUS les accessoires disponibles dans le système
  const allAccessories = await this.memberRepository.manager
    .createQueryBuilder()
    .select(['acc.uuid AS uuid', 'acc.name AS name'])
    .from('accessories', 'acc')
    .where('acc.deleted_at IS NULL')
    .orderBy('acc.name', 'ASC')
    .getRawMany();

  // Récupérer les responsabilités des membres
  const memberUuids = members.map(m => m.uuid);
  let memberResponsibilities: any[] = [];

  if (memberUuids.length > 0) {
    memberResponsibilities = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
      .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
      .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
      .select([
        'm.uuid AS member_uuid',
        'r.uuid AS responsibility_uuid',
        'r.name AS responsibility_name',
        'r.level_uuid AS level_uuid',
        'l.name AS level_name',
        'l.order AS level_order',
      ])
      .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
      .andWhere('m.deleted_at IS NULL')
      .getRawMany();
  }

  // Récupérer les accessoires des membres
  let memberAccessories: any[] = [];

  if (memberUuids.length > 0) {
    memberAccessories = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_accessories', 'ma', 'ma.member_uuid = m.uuid AND ma.deleted_at IS NULL')
      .innerJoin('accessories', 'acc', 'acc.uuid = ma.accessory_uuid AND acc.deleted_at IS NULL')
      .select([
        'm.uuid AS member_uuid',
        'acc.uuid AS accessory_uuid',
        'acc.name AS accessory_name',
      ])
      .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
      .andWhere('m.deleted_at IS NULL')
      .getRawMany();
  }

  // Récupérer les voyages des membres
  let memberTravels: any[] = [];

  if (memberUuids.length > 0) {
    memberTravels = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_travels', 'mt', 'mt.member_uuid = m.uuid AND mt.deleted_at IS NULL')
      .leftJoin('countries', 'tc', 'tc.uuid = mt.country_uuid')
      .select([
        'm.uuid AS member_uuid',
        'mt.uuid AS travel_uuid',
        'mt.country_uuid AS travel_country_uuid',
        'tc.name AS travel_country_name',
        'mt.traveled_at AS traveled_at',
        'mt.about AS travel_about',
      ])
      .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
      .andWhere('m.deleted_at IS NULL')
      .orderBy('mt.traveled_at', 'DESC')
      .getRawMany();
  }

  // Grouper les responsabilités par membre
  const responsibilitiesMap = new Map<string, any[]>();
  for (const mr of memberResponsibilities) {
    if (!responsibilitiesMap.has(mr.member_uuid)) {
      responsibilitiesMap.set(mr.member_uuid, []);
    }
    responsibilitiesMap.get(mr.member_uuid)!.push({
      uuid: mr.responsibility_uuid,
      name: mr.responsibility_name,
      level_uuid: mr.level_uuid,
      level_name: mr.level_name,
      level_order: mr.level_order,
    });
  }

  // Grouper les accessoires par membre avec Set d'UUIDs
  const accessoriesMap = new Map<string, Set<string>>();
  for (const ma of memberAccessories) {
    if (!accessoriesMap.has(ma.member_uuid)) {
      accessoriesMap.set(ma.member_uuid, new Set<string>());
    }
    accessoriesMap.get(ma.member_uuid)!.add(ma.accessory_uuid);
  }

  // Grouper les voyages par membre
  const travelsMap = new Map<string, any[]>();
  for (const mt of memberTravels) {
    if (!travelsMap.has(mt.member_uuid)) {
      travelsMap.set(mt.member_uuid, []);
    }
    travelsMap.get(mt.member_uuid)!.push({
      uuid: mt.travel_uuid,
      country_uuid: mt.travel_country_uuid,
      country_name: mt.travel_country_name,
      traveled_at: mt.traveled_at,
      about: mt.travel_about,
    });
  }

  // Construire les structure_tree pour chaque membre
  const memberStructureTreeMap = new Map<string, any>();

  for (const m of members) {
    if (!m.structure_uuid) continue;

    const memberResponsibilitiesList = responsibilitiesMap.get(m.uuid) || [];

    if (memberResponsibilitiesList.length > 0) {
      const validResponsibilities = memberResponsibilitiesList.filter(r => r.level_order !== null);

      if (validResponsibilities.length > 0) {
        const highestLevelOrder = Math.min(
          ...validResponsibilities.map(r => parseInt(r.level_order))
        );

        const tree = await this.getStructureTreeForResponsible(
          m.structure_uuid,
          highestLevelOrder
        );

        memberStructureTreeMap.set(m.uuid, tree);
      } else {
        const tree = await this.getStructureTreeForResponsible(
          m.structure_uuid,
          999
        );
        memberStructureTreeMap.set(m.uuid, tree);
      }
    } else {
      const tree = await this.getStructureTreeForResponsible(
        m.structure_uuid,
        999
      );
      memberStructureTreeMap.set(m.uuid, tree);
    }
  }

  // Fonction helper pour extraire les level_names et les structure_names (en sautant le premier niveau)
  const flattenStructureTree = (tree: any, skipFirst = true): { levelNames: string[], structureNames: string[] } => {
    const levelNames: string[] = [];
    const structureNames: string[] = [];

    if (tree) {
      if (!skipFirst) {
        levelNames.push(tree.level_name || '');
        structureNames.push(tree.name || '');
      }

      if (tree.children && tree.children.length > 0) {
        tree.children.forEach((child: any) => {
          const childResults = flattenStructureTree(child, false);
          levelNames.push(...childResults.levelNames);
          structureNames.push(...childResults.structureNames);
        });
      }
    }

    return { levelNames, structureNames };
  };

  // Récupérer un arbre exemple pour déterminer les noms de niveaux (en sautant le premier)
  const sampleTree = memberStructureTreeMap.values().next().value;
  const { levelNames: structureLevelNames } = sampleTree ? flattenStructureTree(sampleTree, true) : { levelNames: [] };

  // Créer le workbook Excel
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Membres');

  // Définir les colonnes de base (SANS la colonne 'Accessoires')
  const baseColumns = [
    { header: 'Matricule', key: 'matricule', width: 15 },
    { header: 'Nom', key: 'lastname', width: 20 },
    { header: 'Prénom', key: 'firstname', width: 20 },
    { header: 'Genre', key: 'gender', width: 10 },
    { header: 'Date de naissance', key: 'birth_date', width: 15 },
    { header: 'Lieu de naissance', key: 'birth_city', width: 15 },
    { header: 'Civilité', key: 'civility_name', width: 15 },
    { header: 'Situation matrimoniale', key: 'marital_status_name', width: 15 },
    { header: 'Nom du conjoint', key: 'spouse_name', width: 20 },
    { header: 'Membre de la famille', key: 'spouse_member', width: 15 },
    { header: 'Nombre d\'enfants', key: 'childrens', width: 15 },
    { header: 'Pays', key: 'country_name', width: 15 },
    { header: 'Ville', key: 'city_name', width: 15 },
    { header: 'Formation', key: 'formation_name', width: 20 },
    { header: 'Profession', key: 'job_name', width: 20 },
    { header: 'Téléphone', key: 'phone', width: 15 },
    { header: 'WhatsApp', key: 'phone_whatsapp', width: 15 },
    { header: 'Nom du tuteur', key: 'tutor_name', width: 20 },
    { header: 'Téléphone du tuteur', key: 'tutor_phone', width: 15 },
    { header: 'Ville de l\'organisation', key: 'organisation_city', width: 20 },
    { header: 'Voyages', key: 'travels', width: 40 },
    { header: 'Email', key: 'email', width: 25 },
    { header: 'Département', key: 'department_name', width: 20 },
    { header: 'Division', key: 'division_name', width: 20 },
    { header: 'Gohonzon', key: 'has_gohonzon', width: 12 },
    { header: 'Date adhésion', key: 'membership_date', width: 15 },
    { header: 'Sokahan Byakuren', key: 'sokahan_byakuren', width: 15 },
    { header: 'Tokusso', key: 'has_tokusso', width: 12 },
    { header: 'Date Tokusso', key: 'date_tokusso', width: 15 },
    { header: 'Omamori', key: 'has_omamori', width: 12 },
    { header: 'Date Omamori', key: 'date_omamori', width: 15 },
    { header: 'Responsabilités', key: 'responsibilities', width: 40 },
    { header: 'Longitude', key: 'longitude', width: 15 },
    { header: 'Latitude', key: 'latitude', width: 15 },
  ];

  // Créer les colonnes pour chaque accessoire
  const accessoryColumns: { header: string; key: string; width: number }[] = [];
  allAccessories.forEach((accessory) => {
    accessoryColumns.push({
      header: accessory.name,
      key: `accessory_${accessory.uuid}`,
      width: 15,
    });
  });

  // Ajouter les colonnes pour la structure tree
  const structureTreeColumns: { header: string; key: string; width: number }[] = [];

  structureLevelNames.forEach((levelName: string, index: number) => {
    structureTreeColumns.push({
      header: levelName || `Structure Niveau ${index + 1}`,
      key: `structure_level_${index}`,
      width: 25,
    });
  });

  worksheet.columns = [...baseColumns, ...accessoryColumns, ...structureTreeColumns];

  // Styliser l'en-tête
  worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  worksheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

  // Ajouter les données
  members.forEach(member => {
    const responsibilities = responsibilitiesMap.get(member.uuid) || [];
    const responsibilitiesText = responsibilities
      .map(r => `${r.name} (${r.level_name})`)
      .join(', ');

    const memberAccessorySet = accessoriesMap.get(member.uuid) || new Set<string>();

    // Récupérer les voyages du membre
    const travels = travelsMap.get(member.uuid) || [];
    const travelsText = travels
      .map(t => {
        const date = t.traveled_at ? new Date(t.traveled_at).toLocaleDateString('fr-FR') : '';
        const country = t.country_name || 'Pays inconnu';
        const about = t.about ? ` (${t.about})` : '';
        return `${country} - ${date}${about}`;
      })
      .join(' | ');

    const tree = memberStructureTreeMap.get(member.uuid);
    const { structureNames: treeFlattened } = tree ? flattenStructureTree(tree, true) : { structureNames: [] };

    const rowData: any = {
      matricule: member.matricule || '',
      firstname: member.firstname || '',
      lastname: member.lastname || '',
      gender: member.gender || '',
      civility_name: member.civility_name || '',
      marital_status_name: member.marital_status_name || '',
      spouse_name: member.spouse_name || '',
      spouse_member: member.spouse_member || '',
      childrens: member.childrens || '',
      country_name: member.country_name || '',
      city_name: member.city_name || '',
      formation_name: member.formation_name || '',
      job_name: member.job_name || '',
      organisation_city: member.organisation_city || '',
      birth_date: member.birth_date ? new Date(member.birth_date).toLocaleDateString('fr-FR') : '',
      birth_city: member.city_name || '',
      phone: member.phone || '',
      phone_whatsapp: member.phone_whatsapp || '',
      tutor_name: member.tutor_name || '',
      tutor_phone: member.tutor_phone || '',
      longitude: member.longitude || '',
      latitude: member.latitude || '',
      email: member.email || '',
      department_name: member.department_name || '',
      division_name: member.division_name || '',
      sokahan_byakuren: member.sokahan_byakuren ? 'Oui' : 'Non',
      has_gohonzon: member.has_gohonzon ? 'Oui' : 'Non',
      has_tokusso: member.has_tokusso ? 'Oui' : 'Non',
      date_tokusso: member.date_tokusso ? new Date(member.date_tokusso).toLocaleDateString('fr-FR') : '',
      has_omamori: member.has_omamori ? 'Oui' : 'Non',
      date_omamori: member.date_omamori ? new Date(member.date_omamori).toLocaleDateString('fr-FR') : '',
      membership_date: member.membership_date ? new Date(member.membership_date).toLocaleDateString('fr-FR') : '',
      responsibilities: responsibilitiesText || '',
      travels: travelsText || '',
    };

    // Ajouter les colonnes d'accessoires (Oui/Non)
    allAccessories.forEach((accessory) => {
      rowData[`accessory_${accessory.uuid}`] = memberAccessorySet.has(accessory.uuid) ? 'Oui' : 'Non';
    });

    // Ajouter les colonnes de structure tree
    structureLevelNames.forEach((levelName: string, index: number) => {
      rowData[`structure_level_${index}`] = treeFlattened[index] || '';
    });

    worksheet.addRow(rowData);
  });

  // Appliquer des bordures
  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  });

  return workbook;
}

  async generateMembersWorkbook_old(
    memberUuid: string,
    structureUuid: string,
    filterParams?: {
      search?: string;
      gender?: 'homme' | 'femme';
      has_gohonzon?: boolean;
      region_uuid?: string;
      centre_uuid?: string;
      chapitre_uuid?: string;
      district_uuid?: string;
      groupe_uuid?: string;
      department_uuid?: string;
      division_uuid?: string;
    }
  ): Promise<ExcelJS.Workbook> {
    // Vérifier que l'utilisateur a un member_uuid
    if (!memberUuid) {
      throw new NotFoundException('Utilisateur non associé à un membre');
    }

    const member = await this.memberRepository.findOne({
      where: { uuid: memberUuid },
    });

    if (!member || !structureUuid) {
      throw new NotFoundException('Structure du membre non trouvée');
    }

    // Récupérer toutes les sous-structures accessibles
    const allStructureUuids = await this.getAllSubStructureUuids(structureUuid);

    // Construire la requête de base pour les membres
    let membersQuery = this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('structures', 's', 's.uuid = m.structure_uuid')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
      .leftJoin('civilities', 'c', 'c.uuid = m.civility_uuid')
      .leftJoin('marital_status', 'ms', 'ms.uuid = m.marital_status_uuid')
      .leftJoin('countries', 'ctry', 'ctry.uuid = m.country_uuid')
      .leftJoin('cities', 'city', 'city.uuid = m.city_uuid')
      .leftJoin('formations', 'f', 'f.uuid = m.formation_uuid')
      .leftJoin('jobs', 'j', 'j.uuid = m.job_uuid')
      .leftJoin('organisation_cities', 'oc', 'oc.uuid = m.organisation_city_uuid')
      .select([
        'm.uuid AS uuid',
        'm.matricule AS matricule',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.civility_uuid AS civility_uuid',
        'c.name AS civility_name',
        'm.marital_status_uuid AS marital_status_uuid',
        'ms.name AS marital_status_name',
        'm.country_uuid AS country_uuid',
        'ctry.name AS country_name',
        'm.city_uuid AS city_uuid',
        'city.name AS city_name',
        'm.formation_uuid AS formation_uuid',
        'f.name AS formation_name',
        'm.job_uuid AS job_uuid',
        'j.name AS job_name',
        'm.organisation_city_uuid AS organisation_city_uuid',
        'oc.name AS organisation_city',
        'm.gender AS gender',
        'm.birth_date AS birth_date',
        'm.phone AS phone',
        'm.phone_whatsapp AS phone_whatsapp',
        'm.email AS email',
        'm.structure_uuid AS structure_uuid',
        's.name AS structure_name',
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'm.division_uuid AS division_uuid',
        'div.name AS division_name',
        'm.has_gohonzon AS has_gohonzon',
        'm.membership_date AS membership_date',
        'm.sokahan_byakuren AS sokahan_byakuren',
        'm.spouse_name AS spouse_name',
        'm.spouse_member AS spouse_member',
        'm.childrens AS childrens',
        'm.tutor_name AS tutor_name',
        'm.tutor_phone AS tutor_phone',
        'm.has_tokusso AS has_tokusso',
        'm.date_tokusso AS date_tokusso',
        'm.has_omamori AS has_omamori',
        'm.date_omamori AS date_omamori',
        'm.longitude AS longitude',
        'm.latitude AS latitude',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: allStructureUuids })
      .andWhere('m.deleted_at IS NULL');

    // Appliquer les filtres
    if (filterParams?.search) {
      membersQuery = membersQuery.andWhere(
        "(LOWER(m.firstname) LIKE LOWER(:search) OR LOWER(m.lastname) LIKE LOWER(:search) OR LOWER(m.matricule) LIKE LOWER(:search) OR LOWER(m.phone) LIKE LOWER(:search) OR LOWER(m.email) LIKE LOWER(:search))",
        { search: `%${filterParams.search}%` }
      );
    }

    if (filterParams?.gender) {
      membersQuery = membersQuery.andWhere('m.gender = :gender', {
        gender: filterParams.gender
      });
    }

    if (filterParams?.has_gohonzon !== undefined) {
      membersQuery = membersQuery.andWhere('m.has_gohonzon = :hasGohonzon', {
        hasGohonzon: filterParams.has_gohonzon
      });
    }

    if (filterParams?.department_uuid) {
      membersQuery = membersQuery.andWhere('m.department_uuid = :deptUuid', {
        deptUuid: filterParams.department_uuid
      });
    }

    if (filterParams?.division_uuid) {
      membersQuery = membersQuery.andWhere('m.division_uuid = :divUuid', {
        divUuid: filterParams.division_uuid
      });
    }

    // Récupérer tous les membres (sans pagination)
    const members = await membersQuery
      .orderBy('m.firstname', 'ASC')
      .addOrderBy('m.lastname', 'ASC')
      .getRawMany();

    // Récupérer les responsabilités des membres
    const memberUuids = members.map(m => m.uuid);
    let memberResponsibilities: any[] = [];

    if (memberUuids.length > 0) {
      memberResponsibilities = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
        .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
        .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
        .select([
          'm.uuid AS member_uuid',
          'r.uuid AS responsibility_uuid',
          'r.name AS responsibility_name',
          'r.level_uuid AS level_uuid',
          'l.name AS level_name',
          'l.order AS level_order',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();
    }

    // Récupérer les accessoires des membres
    let memberAccessories: any[] = [];

    if (memberUuids.length > 0) {
      memberAccessories = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_accessories', 'ma', 'ma.member_uuid = m.uuid AND ma.deleted_at IS NULL')
        .innerJoin('accessories', 'acc', 'acc.uuid = ma.accessory_uuid AND acc.deleted_at IS NULL')
        .select([
          'm.uuid AS member_uuid',
          'acc.uuid AS accessory_uuid',
          'acc.name AS accessory_name',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();
    }

    // Récupérer les voyages des membres
    let memberTravels: any[] = [];

    if (memberUuids.length > 0) {
      memberTravels = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_travels', 'mt', 'mt.member_uuid = m.uuid AND mt.deleted_at IS NULL')
        .leftJoin('countries', 'tc', 'tc.uuid = mt.country_uuid')
        .select([
          'm.uuid AS member_uuid',
          'mt.uuid AS travel_uuid',
          'mt.country_uuid AS travel_country_uuid',
          'tc.name AS travel_country_name',
          'mt.traveled_at AS traveled_at',
          'mt.about AS travel_about',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .orderBy('mt.traveled_at', 'DESC') // Les voyages les plus récents en premier
        .getRawMany();
    }

    // Grouper les responsabilités par membre
    const responsibilitiesMap = new Map<string, any[]>();
    for (const mr of memberResponsibilities) {
      if (!responsibilitiesMap.has(mr.member_uuid)) {
        responsibilitiesMap.set(mr.member_uuid, []);
      }
      responsibilitiesMap.get(mr.member_uuid)!.push({
        uuid: mr.responsibility_uuid,
        name: mr.responsibility_name,
        level_uuid: mr.level_uuid,
        level_name: mr.level_name,
        level_order: mr.level_order,
      });
    }

    // Grouper les accessoires par membre
    const accessoriesMap = new Map<string, any[]>();
    for (const ma of memberAccessories) {
      if (!accessoriesMap.has(ma.member_uuid)) {
        accessoriesMap.set(ma.member_uuid, []);
      }
      accessoriesMap.get(ma.member_uuid)!.push({
        uuid: ma.accessory_uuid,
        name: ma.accessory_name,
      });
    }

    // Grouper les voyages par membre
    const travelsMap = new Map<string, any[]>();
    for (const mt of memberTravels) {
      if (!travelsMap.has(mt.member_uuid)) {
        travelsMap.set(mt.member_uuid, []);
      }
      travelsMap.get(mt.member_uuid)!.push({
        uuid: mt.travel_uuid,
        country_uuid: mt.travel_country_uuid,
        country_name: mt.travel_country_name,
        traveled_at: mt.traveled_at,
        about: mt.travel_about,
      });
    }

    // Construire les structure_tree pour chaque membre
    const memberStructureTreeMap = new Map<string, any>();

    for (const m of members) {
      if (!m.structure_uuid) continue;

      const memberResponsibilitiesList = responsibilitiesMap.get(m.uuid) || [];

      if (memberResponsibilitiesList.length > 0) {
        const validResponsibilities = memberResponsibilitiesList.filter(r => r.level_order !== null);

        if (validResponsibilities.length > 0) {
          const highestLevelOrder = Math.min(
            ...validResponsibilities.map(r => parseInt(r.level_order))
          );

          const tree = await this.getStructureTreeForResponsible(
            m.structure_uuid,
            highestLevelOrder
          );

          memberStructureTreeMap.set(m.uuid, tree);
        } else {
          const tree = await this.getStructureTreeForResponsible(
            m.structure_uuid,
            999
          );
          memberStructureTreeMap.set(m.uuid, tree);
        }
      } else {
        const tree = await this.getStructureTreeForResponsible(
          m.structure_uuid,
          999
        );
        memberStructureTreeMap.set(m.uuid, tree);
      }
    }

    // Fonction helper pour extraire les level_names et les structure_names (en sautant le premier niveau)
    const flattenStructureTree = (tree: any, skipFirst = true): { levelNames: string[], structureNames: string[] } => {
      const levelNames: string[] = [];
      const structureNames: string[] = [];

      if (tree) {
        if (!skipFirst) {
          levelNames.push(tree.level_name || '');
          structureNames.push(tree.name || '');
        }

        if (tree.children && tree.children.length > 0) {
          tree.children.forEach((child: any) => {
            const childResults = flattenStructureTree(child, false);
            levelNames.push(...childResults.levelNames);
            structureNames.push(...childResults.structureNames);
          });
        }
      }

      return { levelNames, structureNames };
    };

    // Récupérer un arbre exemple pour déterminer les noms de niveaux (en sautant le premier)
    const sampleTree = memberStructureTreeMap.values().next().value;
    const { levelNames: structureLevelNames } = sampleTree ? flattenStructureTree(sampleTree, true) : { levelNames: [] };

    // Créer le workbook Excel
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Membres');

    // Définir les colonnes de base
    const baseColumns = [
      { header: 'Matricule', key: 'matricule', width: 15 },
      { header: 'Nom', key: 'lastname', width: 20 },
      { header: 'Prénom', key: 'firstname', width: 20 },
      { header: 'Genre', key: 'gender', width: 10 },
      { header: 'Date de naissance', key: 'birth_date', width: 15 },
      { header: 'Lieu de naissance', key: 'birth_city', width: 15 },
      { header: 'Civilité', key: 'civility_name', width: 15 },
      { header: 'Situation matrimoniale', key: 'marital_status_name', width: 15 },
      { header: 'Nom du conjoint', key: 'spouse_name', width: 20 },
      { header: 'Membre de la famille', key: 'spouse_member', width: 15 },
      { header: 'Nombre d\'enfants', key: 'childrens', width: 15 },
      { header: 'Pays', key: 'country_name', width: 15 },
      { header: 'Ville', key: 'city_name', width: 15 },
      { header: 'Formation', key: 'formation_name', width: 20 },
      { header: 'Profession', key: 'job_name', width: 20 },
      { header: 'Téléphone', key: 'phone', width: 15 },
      { header: 'WhatsApp', key: 'phone_whatsapp', width: 15 },
      { header: 'Nom du tuteur', key: 'tutor_name', width: 20 },
      { header: 'Téléphone du tuteur', key: 'tutor_phone', width: 15 },
      { header: 'Ville de l\'organisation', key: 'organisation_city', width: 20 },
      { header: 'Accessoires', key: 'accessories', width: 30 },
      { header: 'Voyages', key: 'travels', width: 40 },
      { header: 'Email', key: 'email', width: 25 },
      { header: 'Département', key: 'department_name', width: 20 },
      { header: 'Division', key: 'division_name', width: 20 },
      { header: 'Gohonzon', key: 'has_gohonzon', width: 12 },
      { header: 'Date adhésion', key: 'membership_date', width: 15 },
      { header: 'Sokahan Byakuren', key: 'sokahan_byakuren', width: 15 },
      { header: 'Tokusso', key: 'has_tokusso', width: 12 },
      { header: 'Date Tokusso', key: 'date_tokusso', width: 15 },
      { header: 'Omamori', key: 'has_omamori', width: 12 },
      { header: 'Date Omamori', key: 'date_omamori', width: 15 },
      { header: 'Responsabilités', key: 'responsibilities', width: 40 },
      { header: 'Longitude', key: 'longitude', width: 15 },
      { header: 'Latitude', key: 'latitude', width: 15 },
    ];

    // Ajouter les colonnes pour la structure tree
    const structureTreeColumns: { header: string; key: string; width: number }[] = [];

    structureLevelNames.forEach((levelName: string, index: number) => {
      structureTreeColumns.push({
        header: levelName || `Structure Niveau ${index + 1}`,
        key: `structure_level_${index}`,
        width: 25,
      });
    });

    worksheet.columns = [...baseColumns, ...structureTreeColumns];

    // Styliser l'en-tête
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };
    worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

    // Ajouter les données
    members.forEach(member => {
      const responsibilities = responsibilitiesMap.get(member.uuid) || [];
      const responsibilitiesText = responsibilities
        .map(r => `${r.name} (${r.level_name})`)
        .join(', ');

      const accessories = accessoriesMap.get(member.uuid) || [];
      const accessoriesText = accessories
        .map(a => a.name)
        .join(', ');

      // Récupérer les voyages du membre
      const travels = travelsMap.get(member.uuid) || [];
      const travelsText = travels
        .map(t => {
          const date = t.traveled_at ? new Date(t.traveled_at).toLocaleDateString('fr-FR') : '';
          const country = t.country_name || 'Pays inconnu';
          const about = t.about ? ` (${t.about})` : '';
          return `${country} - ${date}${about}`;
        })
        .join(' | ');

      const tree = memberStructureTreeMap.get(member.uuid);
      const { structureNames: treeFlattened } = tree ? flattenStructureTree(tree, true) : { structureNames: [] };

      const rowData: any = {
        matricule: member.matricule || '',
        lastname: member.lastname || '',
        firstname: member.firstname || '',
        gender: member.gender || '',
        civility_name: member.civility_name || '',
        marital_status_name: member.marital_status_name || '',
        spouse_name: member.spouse_name || '',
        spouse_member: member.spouse_member || '',
        childrens: member.childrens || '',
        country_name: member.country_name || '',
        city_name: member.city_name || '',
        formation_name: member.formation_name || '',
        job_name: member.job_name || '',
        organisation_city: member.organisation_city || '',
        birth_date: member.birth_date ? new Date(member.birth_date).toLocaleDateString('fr-FR') : '',
        birth_city: member.city_name || '',
        phone: member.phone || '',
        phone_whatsapp: member.phone_whatsapp || '',
        tutor_name: member.tutor_name || '',
        tutor_phone: member.tutor_phone || '',
        longitude: member.longitude || '',
        latitude: member.latitude || '',
        email: member.email || '',
        department_name: member.department_name || '',
        division_name: member.division_name || '',
        sokahan_byakuren: member.sokahan_byakuren ? 'Oui' : 'Non',
        has_gohonzon: member.has_gohonzon ? 'Oui' : 'Non',
        has_tokusso: member.has_tokusso ? 'Oui' : 'Non',
        date_tokusso: member.date_tokusso ? new Date(member.date_tokusso).toLocaleDateString('fr-FR') : '',
        has_omamori: member.has_omamori ? 'Oui' : 'Non',
        date_omamori: member.date_omamori ? new Date(member.date_omamori).toLocaleDateString('fr-FR') : '',
        membership_date: member.membership_date ? new Date(member.membership_date).toLocaleDateString('fr-FR') : '',
        responsibilities: responsibilitiesText || '',
        accessories: accessoriesText || '',
        travels: travelsText || '',
      };

      structureLevelNames.forEach((levelName: string, index: number) => {
        rowData[`structure_level_${index}`] = treeFlattened[index] || '';
      });

      worksheet.addRow(rowData);
    });

    // Appliquer des bordures
    worksheet.eachRow((row, rowNumber) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin' },
          left: { style: 'thin' },
          bottom: { style: 'thin' },
          right: { style: 'thin' },
        };
      });
    });

    return workbook;
  }

  async getCommitteeResponsibles(
    memberUuid?: string,
    responsibilityStructureUuid?: string,
  ) {
    let targetStructure: StructureEntity | null = null;

    if (responsibilityStructureUuid) {
      targetStructure = await this.structureRepository.findOne({
        where: { uuid: responsibilityStructureUuid },
        relations: ['level', 'parent'],
      });
      if (!targetStructure) {
        throw new NotFoundException('Structure non trouvée');
      }
    } else if (memberUuid) {
      const member = await this.memberRepository.findOne({
        where: { uuid: memberUuid },
        relations: ['structure'],
      });
      if (!member) {
        throw new NotFoundException('Membre non trouvé');
      }
      if (!member.structure_uuid) {
        throw new BadRequestException(
          'Le membre n\'a pas de structure d\'appartenance',
        );
      }
      targetStructure = await this.structureRepository.findOne({
        where: { uuid: member.structure_uuid },
        relations: ['level', 'parent'],
      });
      if (!targetStructure) {
        throw new NotFoundException(
          'Structure d\'appartenance non trouvée',
        );
      }
    } else {
      throw new BadRequestException(
        'Vous devez être associé à une structure',
      );
    }

    if (!targetStructure.level_uuid) {
      return {
        structure: {
          uuid: targetStructure.uuid,
          name: targetStructure.name,
          level: null,
          parent: targetStructure.parent ? { uuid: targetStructure.parent.uuid, name: targetStructure.parent.name } : null,
        },
        responsibles: [],
        vacant_responsibilities: [],
      };
    }

    const responsibilities = await this.responsibilityRepository.find({
      where: { level_uuid: targetStructure.level_uuid, status: 'enable' },
    });

    // Récupérer la structure cible ET toutes ses sous-structures (enfants, petits-enfants, etc.)
    const allStructureUuids: string[] = [targetStructure.uuid];

    const getDescendants = async (parentUuid: string) => {
      const children = await this.structureRepository.find({
        where: { parent_uuid: parentUuid },
        select: ['uuid'],
      });
      for (const child of children) {
        allStructureUuids.push(child.uuid);
        await getDescendants(child.uuid);
      }
    };

    await getDescendants(targetStructure.uuid);

    const responsibles: any[] = [];
    const assignedResponsibilityUuids = new Set<string>();

    for (const responsibility of responsibilities) {
      const query = this.memberResponsibilityRepository
        .createQueryBuilder('mr')
        .leftJoinAndSelect('mr.member', 'm', 'm.uuid = mr.member_uuid')
        .leftJoinAndSelect('mr.responsibility', 'r', 'r.uuid = mr.responsibility_uuid')
        .where('mr.responsibility_uuid = :responsibility_uuid', {
          responsibility_uuid: responsibility.uuid,
        })
        .andWhere('m.structure_uuid IN (:...structure_uuids)', {
          structure_uuids: allStructureUuids,
        });

      const memberResponsibilities = await query
        .orderBy('mr.priority', 'DESC')
        .addOrderBy('m.firstname', 'ASC')
        .getMany();

      if (memberResponsibilities.length > 0) {
        assignedResponsibilityUuids.add(responsibility.uuid);
        for (const mr of memberResponsibilities) {
          if (mr.member) {
            responsibles.push({
              responsibility: {
                uuid: responsibility.uuid,
                name: responsibility.name,
                slug: responsibility.slug,
                gender: responsibility.gender,
              },
              member: {
                uuid: mr.member.uuid,
                firstname: mr.member.firstname,
                lastname: mr.member.lastname,
                picture: mr.member.picture,
                phone: mr.member.phone,
                phone_whatsapp: mr.member.phone_whatsapp,
                email: mr.member.email,
              },
              priority: mr.priority,
            });
          }
        }
      }
    }

    const vacantResponsibilities = responsibilities
      .filter((r) => !assignedResponsibilityUuids.has(r.uuid))
      .map((r) => ({
        uuid: r.uuid,
        name: r.name,
        slug: r.slug,
        gender: r.gender,
      }));

    return {
      structure: {
        uuid: targetStructure.uuid,
        name: targetStructure.name,
        level: targetStructure.level ? {
          uuid: targetStructure.level.uuid,
          name: targetStructure.level.name,
        } : null,
        parent: targetStructure.parent ? {
          uuid: targetStructure.parent.uuid,
          name: targetStructure.parent.name,
        } : null,
      },
      responsibles,
      vacant_responsibilities: vacantResponsibilities,
    };
  }

  private async generateExportFileName_(structure_uuid: string, filterParams: any): Promise<string> {
    const timestamp = new Date().toISOString().split('T')[0];
    const parts: string[] = ['export_membres'];

    // Déterminer la structure de base (ordre de priorité du plus spécifique au plus général)
    const baseStructureUuid =
      filterParams?.groupe_uuid ||
      filterParams?.district_uuid ||
      filterParams?.chapitre_uuid ||
      filterParams?.centre_uuid ||
      filterParams?.region_uuid ||
      structure_uuid;

    // Récupérer toutes les structures nécessaires en une seule requête
    const structureUuids = [
      structure_uuid,
      filterParams?.region_uuid,
      filterParams?.centre_uuid,
      filterParams?.chapitre_uuid,
      filterParams?.district_uuid,
      filterParams?.groupe_uuid,
    ].filter(Boolean);

    const structures = await this.structureRepository.find({
      where: { uuid: In(structureUuids) },
      relations: ['level'],
    });

    // Construire le nom de fichier
    const baseStructure = structures.find(s => s.uuid === baseStructureUuid);

    if (baseStructure) {
      // Ajouter niveau et nom de la structure de base
      if (baseStructure.level) {
        parts.push(this.sanitizeFileName(baseStructure.level.name));
      }
      parts.push(this.sanitizeFileName(baseStructure.name));
    }

    // Ajouter date
    parts.push(timestamp);

    return `${parts.join('_')}.xlsx`;
  }

  private sanitizeFileName(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9]/g, '_')
      .replace(/_+/g, '_')
      .toLowerCase();
  }

  private async generateExportFileName(structure_uuid: string, filterParams: any): Promise<string> {
    const timestamp = new Date().toISOString().split('T')[0];
    const parts: string[] = ['export'];

    // Déterminer la structure cible (ordre de priorité du plus spécifique au plus général)
    const targetStructureUuid =
      filterParams?.sous_groupe_uuid ||
      filterParams?.groupe_uuid ||
      filterParams?.district_uuid ||
      filterParams?.chapitre_uuid ||
      filterParams?.centre_uuid ||
      filterParams?.centre_regional_uuid ||
      filterParams?.region_uuid ||
      structure_uuid;

    // Récupérer la structure cible avec toute sa hiérarchie
    const targetStructure = await this.structureRepository.findOne({
      where: { uuid: targetStructureUuid },
      relations: ['level', 'parent', 'parent.level', 'parent.parent', 'parent.parent.level'],
    });

    if (!targetStructure) {
      parts.push(timestamp);
      return `${parts.join('_')}.xlsx`;
    }

    // Construire le chemin hiérarchique complet
    const hierarchyPath = await this.buildHierarchyPath(targetStructure);

    // Ajouter chaque niveau au nom du fichier
    hierarchyPath.forEach(structure => {
      if (structure.level) {
        parts.push(this.sanitizeFileName(structure.level.name));
      }
      parts.push(this.sanitizeFileName(structure.name));
    });

    // Ajouter la date
    parts.push(timestamp);

    return `${parts.join('_')}.xlsx`;
  }

  /**
   * Construit le chemin hiérarchique complet d'une structure
   * Retourne un tableau ordonné de la racine vers la structure cible
   */
  private async buildHierarchyPath(structure: StructureEntity): Promise<StructureEntity[]> {
    const path: StructureEntity[] = [];
    let currentStructure: StructureEntity | null = structure;

    // Remonter la hiérarchie
    while (currentStructure) {
      path.unshift(currentStructure); // Ajouter au début pour avoir l'ordre racine -> feuille

      if (currentStructure.parent) {
        // Si parent déjà chargé via relations
        currentStructure = currentStructure.parent;
      } else if (currentStructure.parent_uuid) {
        // Sinon charger le parent
        currentStructure = await this.structureRepository.findOne({
          where: { uuid: currentStructure.parent_uuid },
          relations: ['level'],
        });
      } else {
        // Pas de parent, on est à la racine
        currentStructure = null;
      }
    }

    return path;
  }

  async exportMembersByStatCategory(
    user_uuid: string,
    memberUuid: string,
    responsibility_structure_uuid: string,
    category: 'total' | 'hommes' | 'femmes' | 'dept_hommes' | 'dept_femmes' | 'dept_jeunesse' | 'div_jeune_homme' | 'div_jeune_femme' | 'div_avenir',
    filters?: MemberStatsFilters
  ) {

    // Vérifications initiales
    if (!memberUuid) {
      throw new NotFoundException('Utilisateur non associé à un membre');
    }

    const member = await this.memberRepository.findOne({
      where: { uuid: memberUuid },
    });

    if (!member || !responsibility_structure_uuid) {
      throw new NotFoundException('Structure du membre non trouvée');
    }

    // Déterminer la structure cible
    //    (du plus spécifique au plus général : sous-groupe → … → centre régional → région)
    let targetStructureUuid = responsibility_structure_uuid;

    if (filters?.sous_groupe_uuid) {
      targetStructureUuid = filters.sous_groupe_uuid;
    } else if (filters?.groupe_uuid) {
      targetStructureUuid = filters.groupe_uuid;
    } else if (filters?.district_uuid) {
      targetStructureUuid = filters.district_uuid;
    } else if (filters?.chapitre_uuid) {
      targetStructureUuid = filters.chapitre_uuid;
    } else if (filters?.centre_uuid) {
      targetStructureUuid = filters.centre_uuid;
    } else if (filters?.centre_regional_uuid) {
      targetStructureUuid = filters.centre_regional_uuid;
    } else if (filters?.region_uuid) {
      targetStructureUuid = filters.region_uuid;
    }

    // Récupérer les sous-structures
    const targetSubStructures = await this.getAllSubStructureUuids(targetStructureUuid);

    // Construire la requête de base avec TOUTES les relations
    let membersQuery = this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('structures', 's', 's.uuid = m.structure_uuid')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
      .leftJoin('civilities', 'c', 'c.uuid = m.civility_uuid')
      .leftJoin('marital_status', 'ms', 'ms.uuid = m.marital_status_uuid')
      .leftJoin('countries', 'ctry', 'ctry.uuid = m.country_uuid')
      .leftJoin('cities', 'city', 'city.uuid = m.city_uuid')
      .leftJoin('formations', 'f', 'f.uuid = m.formation_uuid')
      .leftJoin('jobs', 'j', 'j.uuid = m.job_uuid')
      .leftJoin('organisation_cities', 'oc', 'oc.uuid = m.organisation_city_uuid')
      .select([
        'm.uuid AS uuid',
        'm.matricule AS matricule',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.civility_uuid AS civility_uuid',
        'c.name AS civility_name',
        'm.marital_status_uuid AS marital_status_uuid',
        'ms.name AS marital_status_name',
        'm.country_uuid AS country_uuid',
        'ctry.name AS country_name',
        'm.city_uuid AS city_uuid',
        'city.name AS city_name',
        'm.formation_uuid AS formation_uuid',
        'f.name AS formation_name',
        'm.job_uuid AS job_uuid',
        'j.name AS job_name',
        'm.organisation_city_uuid AS organisation_city_uuid',
        'oc.name AS organisation_city',
        'm.gender AS gender',
        'm.birth_date AS birth_date',
        'm.phone AS phone',
        'm.phone_whatsapp AS phone_whatsapp',
        'm.email AS email',
        'm.structure_uuid AS structure_uuid',
        's.name AS structure_name',
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'm.division_uuid AS division_uuid',
        'div.name AS division_name',
        'm.has_gohonzon AS has_gohonzon',
        'm.membership_date AS membership_date',
        'm.sokahan_byakuren AS sokahan_byakuren',
        'm.spouse_name AS spouse_name',
        'm.spouse_member AS spouse_member',
        'm.childrens AS childrens',
        'm.tutor_name AS tutor_name',
        'm.tutor_phone AS tutor_phone',
        'm.has_tokusso AS has_tokusso',
        'm.date_tokusso AS date_tokusso',
        'm.has_omamori AS has_omamori',
        'm.date_omamori AS date_omamori',
        'm.longitude AS longitude',
        'm.latitude AS latitude',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: targetSubStructures })
      .andWhere('m.deleted_at IS NULL');

    // Appliquer les filtres selon la catégorie
    switch (category) {
      case 'total':
        break;

      case 'hommes':
        membersQuery = membersQuery.andWhere('m.gender = :gender', { gender: 'homme' });
        break;

      case 'femmes':
        membersQuery = membersQuery.andWhere('m.gender = :gender', { gender: 'femme' });
        break;

      case 'dept_hommes':
        membersQuery = membersQuery
          .andWhere('LOWER(d.name) LIKE :deptName', { deptName: '%homme%' })
          .andWhere('LOWER(d.name) NOT LIKE :notJeune', { notJeune: '%jeune%' });
        break;

      case 'dept_femmes':
        membersQuery = membersQuery
          .andWhere('LOWER(d.name) LIKE :deptName', { deptName: '%femme%' })
          .andWhere('LOWER(d.name) NOT LIKE :notJeune', { notJeune: '%jeune%' });
        break;

      case 'dept_jeunesse':
        membersQuery = membersQuery
          .andWhere('(LOWER(d.name) LIKE :jeune OR LOWER(d.name) LIKE :jeunesse)', {
            jeune: '%jeune%',
            jeunesse: '%jeunesse%'
          });
        break;

      case 'div_jeune_homme':
        membersQuery = membersQuery
          .andWhere('LOWER(div.name) LIKE :jeune', { jeune: '%jeune%' })
          .andWhere('LOWER(div.name) LIKE :homme', { homme: '%homme%' });
        break;

      case 'div_jeune_femme':
        membersQuery = membersQuery
          .andWhere('LOWER(div.name) LIKE :jeune', { jeune: '%jeune%' })
          .andWhere('LOWER(div.name) LIKE :femme', { femme: '%femme%' });
        break;

      case 'div_avenir':
        membersQuery = membersQuery
          .andWhere('LOWER(div.name) LIKE :avenir', { avenir: '%avenir%' });
        break;
    }

    // Appliquer les filtres additionnels
    if (filters?.department_uuid) {
      membersQuery = membersQuery.andWhere('m.department_uuid = :deptUuid', {
        deptUuid: filters.department_uuid,
      });
    }

    if (filters?.division_uuid) {
      membersQuery = membersQuery.andWhere('m.division_uuid = :divUuid', {
        divUuid: filters.division_uuid,
      });
    }

    // Récupérer les membres
    const members = await membersQuery
      .orderBy('m.firstname', 'ASC')
      .addOrderBy('m.lastname', 'ASC')
      .getRawMany();

    //  AJOUT : Récupérer TOUS les accessoires disponibles
    const allAccessories = await this.memberRepository.manager
      .createQueryBuilder()
      .select(['acc.uuid AS uuid', 'acc.name AS name'])
      .from('accessories', 'acc')
      .where('acc.deleted_at IS NULL')
      .orderBy('acc.name', 'ASC')
      .getRawMany();

    // Récupérer les responsabilités
    const memberUuids = members.map(m => m.uuid);
    let memberResponsibilities: any[] = [];
    let memberAccessories: any[] = [];
    let memberTravels: any[] = [];

    if (memberUuids.length > 0) {
      // Responsabilités
      memberResponsibilities = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
        .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
        .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
        .select([
          'm.uuid AS member_uuid',
          'r.uuid AS responsibility_uuid',
          'r.name AS responsibility_name',
          'r.level_uuid AS level_uuid',
          'l.name AS level_name',
          'l.order AS level_order',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();

      // Accessoires
      memberAccessories = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_accessories', 'ma', 'ma.member_uuid = m.uuid AND ma.deleted_at IS NULL')
        .innerJoin('accessories', 'acc', 'acc.uuid = ma.accessory_uuid AND acc.deleted_at IS NULL')
        .select([
          'm.uuid AS member_uuid',
          'acc.uuid AS accessory_uuid',
          'acc.name AS accessory_name',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();

      // Voyages
      memberTravels = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_travels', 'mt', 'mt.member_uuid = m.uuid AND mt.deleted_at IS NULL')
        .leftJoin('countries', 'tc', 'tc.uuid = mt.country_uuid')
        .select([
          'm.uuid AS member_uuid',
          'mt.uuid AS travel_uuid',
          'mt.country_uuid AS travel_country_uuid',
          'tc.name AS travel_country_name',
          'mt.traveled_at AS traveled_at',
          'mt.about AS travel_about',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .orderBy('mt.traveled_at', 'DESC')
        .getRawMany();
    }

    // Grouper les données
    const responsibilitiesMap = new Map<string, any[]>();
    for (const mr of memberResponsibilities) {
      if (!responsibilitiesMap.has(mr.member_uuid)) {
        responsibilitiesMap.set(mr.member_uuid, []);
      }
      responsibilitiesMap.get(mr.member_uuid)!.push({
        uuid: mr.responsibility_uuid,
        name: mr.responsibility_name,
        level_uuid: mr.level_uuid,
        level_name: mr.level_name,
        level_order: mr.level_order,
      });
    }

    //  MODIFICATION : Grouper les accessoires avec Set d'UUIDs
    const accessoriesMap = new Map<string, Set<string>>();
    for (const ma of memberAccessories) {
      if (!accessoriesMap.has(ma.member_uuid)) {
        accessoriesMap.set(ma.member_uuid, new Set<string>());
      }
      accessoriesMap.get(ma.member_uuid)!.add(ma.accessory_uuid);
    }

    const travelsMap = new Map<string, any[]>();
    for (const mt of memberTravels) {
      if (!travelsMap.has(mt.member_uuid)) {
        travelsMap.set(mt.member_uuid, []);
      }
      travelsMap.get(mt.member_uuid)!.push({
        uuid: mt.travel_uuid,
        country_uuid: mt.travel_country_uuid,
        country_name: mt.travel_country_name,
        traveled_at: mt.traveled_at,
        about: mt.travel_about,
      });
    }

    // Construire les structure trees
    const memberStructureTreeMap = new Map<string, any>();

    for (const m of members) {
      if (!m.structure_uuid) continue;

      const memberResponsibilitiesList = responsibilitiesMap.get(m.uuid) || [];

      if (memberResponsibilitiesList.length > 0) {
        const validResponsibilities = memberResponsibilitiesList.filter(r => r.level_order !== null);

        if (validResponsibilities.length > 0) {
          const highestLevelOrder = Math.min(
            ...validResponsibilities.map(r => parseInt(r.level_order))
          );

          const tree = await this.getStructureTreeForResponsible(
            m.structure_uuid,
            highestLevelOrder
          );

          memberStructureTreeMap.set(m.uuid, tree);
        } else {
          const tree = await this.getStructureTreeForResponsible(
            m.structure_uuid,
            999
          );
          memberStructureTreeMap.set(m.uuid, tree);
        }
      } else {
        const tree = await this.getStructureTreeForResponsible(
          m.structure_uuid,
          999
        );
        memberStructureTreeMap.set(m.uuid, tree);
      }
    }

    // Fonction helper
    const flattenStructureTree = (tree: any, skipFirst = true): { levelNames: string[], structureNames: string[] } => {
      const levelNames: string[] = [];
      const structureNames: string[] = [];

      if (tree) {
        if (!skipFirst) {
          levelNames.push(tree.level_name || '');
          structureNames.push(tree.name || '');
        }

        if (tree.children && tree.children.length > 0) {
          tree.children.forEach((child: any) => {
            const childResults = flattenStructureTree(child, false);
            levelNames.push(...childResults.levelNames);
            structureNames.push(...childResults.structureNames);
          });
        }
      }

      return { levelNames, structureNames };
    };

    const sampleTree = memberStructureTreeMap.values().next().value;
    const { levelNames: structureLevelNames } = sampleTree ? flattenStructureTree(sampleTree, true) : { levelNames: [] };

    // Générer le nom de fichier
    const categoryLabels = {
      total: 'tous_membres',
      hommes: 'hommes',
      femmes: 'femmes',
      dept_hommes: 'departement_hommes',
      dept_femmes: 'departement_femmes',
      dept_jeunesse: 'departement_jeunesse',
      div_jeune_homme: 'division_jeunes_hommes',
      div_jeune_femme: 'division_jeunes_femmes',
      div_avenir: 'division_avenir',
    };

    const fileName = `${categoryLabels[category]}_${await this.generateExportFileName(targetStructureUuid, filters)}`;

    // Créer le job
    const job = await this.exportJobService.createJob(
      'members_stats',
      {
        member_uuid: memberUuid,
        structure_uuid: targetStructureUuid,
        category,
        filters
      },
      user_uuid,
    );

    // Lancer l'export en arrière-plan
    setImmediate(async () => {
      try {
        await this.exportJobService.updateJobProgress(job.uuid, 30);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Membres');

        //  MODIFICATION : Définir les colonnes de base SANS 'Accessoires'
        const baseColumns = [
          { header: 'Matricule', key: 'matricule', width: 15 },
          { header: 'Nom', key: 'lastname', width: 20 },
          { header: 'Prénom', key: 'firstname', width: 20 },
          { header: 'Genre', key: 'gender', width: 10 },
          { header: 'Date de naissance', key: 'birth_date', width: 15 },
          { header: 'Lieu de naissance', key: 'birth_city', width: 15 },
          { header: 'Civilité', key: 'civility_name', width: 15 },
          { header: 'Situation matrimoniale', key: 'marital_status_name', width: 15 },
          { header: 'Nom du conjoint', key: 'spouse_name', width: 20 },
          { header: 'Membre de la famille', key: 'spouse_member', width: 15 },
          { header: 'Nombre d\'enfants', key: 'childrens', width: 15 },
          { header: 'Pays', key: 'country_name', width: 15 },
          { header: 'Ville', key: 'city_name', width: 15 },
          { header: 'Formation', key: 'formation_name', width: 20 },
          { header: 'Profession', key: 'job_name', width: 20 },
          { header: 'Téléphone', key: 'phone', width: 15 },
          { header: 'WhatsApp', key: 'phone_whatsapp', width: 15 },
          { header: 'Nom du tuteur', key: 'tutor_name', width: 20 },
          { header: 'Téléphone du tuteur', key: 'tutor_phone', width: 15 },
          { header: 'Ville de l\'organisation', key: 'organisation_city', width: 20 },
          { header: 'Voyages', key: 'travels', width: 40 },
          { header: 'Email', key: 'email', width: 25 },
          { header: 'Département', key: 'department_name', width: 20 },
          { header: 'Division', key: 'division_name', width: 20 },
          { header: 'Gohonzon', key: 'has_gohonzon', width: 12 },
          { header: 'Date adhésion', key: 'membership_date', width: 15 },
          { header: 'Sokahan Byakuren', key: 'sokahan_byakuren', width: 15 },
          { header: 'Tokusso', key: 'has_tokusso', width: 12 },
          { header: 'Date Tokusso', key: 'date_tokusso', width: 15 },
          { header: 'Omamori', key: 'has_omamori', width: 12 },
          { header: 'Date Omamori', key: 'date_omamori', width: 15 },
          { header: 'Responsabilités', key: 'responsibilities', width: 40 },
          { header: 'Longitude', key: 'longitude', width: 15 },
          { header: 'Latitude', key: 'latitude', width: 15 },
        ];

        //  AJOUT : Créer les colonnes pour chaque accessoire
        const accessoryColumns: { header: string; key: string; width: number }[] = [];
        allAccessories.forEach((accessory) => {
          accessoryColumns.push({
            header: accessory.name,
            key: `accessory_${accessory.uuid}`,
            width: 15,
          });
        });

        const structureTreeColumns: { header: string; key: string; width: number }[] = [];
        structureLevelNames.forEach((levelName: string, index: number) => {
          structureTreeColumns.push({
            header: levelName || `Structure Niveau ${index + 1}`,
            key: `structure_level_${index}`,
            width: 25,
          });
        });

        // AJOUT : Colonne UUID à la fin
      const uuidColumn = [
        { header: 'UUID', key: 'uuid', width: 40 }
      ];
        //  MODIFICATION : Ajouter les colonnes accessoires
        worksheet.columns = [...baseColumns, ...accessoryColumns, ...structureTreeColumns, ...uuidColumn];

        // Styliser l'en-tête
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' },
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // Ajouter les données
        members.forEach(member => {
          const responsibilities = responsibilitiesMap.get(member.uuid) || [];
          const responsibilitiesText = responsibilities
            .map(r => `${r.name} (${r.level_name})`)
            .join(', ');

          //  MODIFICATION : Récupérer le Set des accessoires
          const memberAccessorySet = accessoriesMap.get(member.uuid) || new Set<string>();

          const travels = travelsMap.get(member.uuid) || [];
          const travelsText = travels
            .map(t => {
              const date = t.traveled_at ? new Date(t.traveled_at).toLocaleDateString('fr-FR') : '';
              const country = t.country_name || 'Pays inconnu';
              const about = t.about ? ` (${t.about})` : '';
              return `${country} - ${date}${about}`;
            })
            .join(' | ');

          const tree = memberStructureTreeMap.get(member.uuid);
          const { structureNames: treeFlattened } = tree ? flattenStructureTree(tree, true) : { structureNames: [] };

          const rowData: any = {
            matricule: member.matricule || '',
            lastname: member.lastname || '',
            firstname: member.firstname || '',
            gender: member.gender || '',
            civility_name: member.civility_name || '',
            marital_status_name: member.marital_status_name || '',
            spouse_name: member.spouse_name || '',
            spouse_member: member.spouse_member || '',
            childrens: member.childrens || '',
            country_name: member.country_name || '',
            city_name: member.city_name || '',
            formation_name: member.formation_name || '',
            job_name: member.job_name || '',
            organisation_city: member.organisation_city || '',
            birth_date: member.birth_date ? new Date(member.birth_date).toLocaleDateString('fr-FR') : '',
            birth_city: member.city_name || '',
            phone: member.phone || '',
            phone_whatsapp: member.phone_whatsapp || '',
            tutor_name: member.tutor_name || '',
            tutor_phone: member.tutor_phone || '',
            longitude: member.longitude || '',
            latitude: member.latitude || '',
            email: member.email || '',
            department_name: member.department_name || '',
            division_name: member.division_name || '',
            sokahan_byakuren: member.sokahan_byakuren ? 'Oui' : 'Non',
            has_gohonzon: member.has_gohonzon ? 'Oui' : 'Non',
            has_tokusso: member.has_tokusso ? 'Oui' : 'Non',
            date_tokusso: member.date_tokusso ? new Date(member.date_tokusso).toLocaleDateString('fr-FR') : '',
            has_omamori: member.has_omamori ? 'Oui' : 'Non',
            date_omamori: member.date_omamori ? new Date(member.date_omamori).toLocaleDateString('fr-FR') : '',
            membership_date: member.membership_date ? new Date(member.membership_date).toLocaleDateString('fr-FR') : '',
            responsibilities: responsibilitiesText || '',
            travels: travelsText || '',
          };

          //  AJOUT : Ajouter les colonnes d'accessoires (Oui/Non)
          allAccessories.forEach((accessory) => {
            rowData[`accessory_${accessory.uuid}`] = memberAccessorySet.has(accessory.uuid) ? 'Oui' : 'Non';
          });

          structureLevelNames.forEach((levelName: string, index: number) => {
            rowData[`structure_level_${index}`] = treeFlattened[index] || '';
          });
          rowData['uuid'] = member.uuid; // Ajouter l'UUID pour référence (peut être masqué dans Excel)
          worksheet.addRow(rowData);
        });

        // Appliquer les bordures
        worksheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            };
          });
        });

        await this.exportJobService.updateJobProgress(job.uuid, 80);

        // Sauvegarder
        const uploadsDir = path.join(process.cwd(), 'uploads', 'exports');

        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const filePath = path.join(uploadsDir, fileName);
        await workbook.xlsx.writeFile(filePath);

        await this.exportJobService.completeJob(job.uuid, filePath, fileName);

      } catch (error) {
        console.error('Export members stats error:', error);
        await this.exportJobService.updateJobStatus(
          job.uuid,
          ExportJobStatus.FAILED,
          error.message
        );
      }
    });

    return {
      success: true,
      message: 'Export en cours de traitement',
      jobId: job.uuid,
      checkStatusUrl: `/export/status/${job.uuid}`,
    };
  }


  async exportMembersByStatCategory_old(
    user_uuid: string,
    memberUuid: string,
    responsibility_structure_uuid: string,
    category: 'total' | 'hommes' | 'femmes' | 'dept_hommes' | 'dept_femmes' | 'dept_jeunesse' | 'div_jeune_homme' | 'div_jeune_femme' | 'div_avenir',
    filters?: MemberStatsFilters
  ) {

    // Vérifications initiales
    if (!memberUuid) {
      throw new NotFoundException('Utilisateur non associé à un membre');
    }

    const member = await this.memberRepository.findOne({
      where: { uuid: memberUuid },
    });

    if (!member || !responsibility_structure_uuid) {
      throw new NotFoundException('Structure du membre non trouvée');
    }

    // Déterminer la structure cible
    //    (du plus spécifique au plus général : sous-groupe → … → centre régional → région)
    let targetStructureUuid = responsibility_structure_uuid;

    if (filters?.sous_groupe_uuid) {
      targetStructureUuid = filters.sous_groupe_uuid;
    } else if (filters?.groupe_uuid) {
      targetStructureUuid = filters.groupe_uuid;
    } else if (filters?.district_uuid) {
      targetStructureUuid = filters.district_uuid;
    } else if (filters?.chapitre_uuid) {
      targetStructureUuid = filters.chapitre_uuid;
    } else if (filters?.centre_uuid) {
      targetStructureUuid = filters.centre_uuid;
    } else if (filters?.centre_regional_uuid) {
      targetStructureUuid = filters.centre_regional_uuid;
    } else if (filters?.region_uuid) {
      targetStructureUuid = filters.region_uuid;
    }

    // Récupérer les sous-structures
    const targetSubStructures = await this.getAllSubStructureUuids(targetStructureUuid);

    // Construire la requête de base avec TOUTES les relations
    let membersQuery = this.memberRepository
      .createQueryBuilder('m')
      .leftJoin('structures', 's', 's.uuid = m.structure_uuid')
      .leftJoin('departments', 'd', 'd.uuid = m.department_uuid')
      .leftJoin('divisions', 'div', 'div.uuid = m.division_uuid')
      .leftJoin('civilities', 'c', 'c.uuid = m.civility_uuid')
      .leftJoin('marital_status', 'ms', 'ms.uuid = m.marital_status_uuid')
      .leftJoin('countries', 'ctry', 'ctry.uuid = m.country_uuid')
      .leftJoin('cities', 'city', 'city.uuid = m.city_uuid')
      .leftJoin('formations', 'f', 'f.uuid = m.formation_uuid')
      .leftJoin('jobs', 'j', 'j.uuid = m.job_uuid')
      .leftJoin('organisation_cities', 'oc', 'oc.uuid = m.organisation_city_uuid')
      .select([
        'm.uuid AS uuid',
        'm.matricule AS matricule',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.civility_uuid AS civility_uuid',
        'c.name AS civility_name',
        'm.marital_status_uuid AS marital_status_uuid',
        'ms.name AS marital_status_name',
        'm.country_uuid AS country_uuid',
        'ctry.name AS country_name',
        'm.city_uuid AS city_uuid',
        'city.name AS city_name',
        'm.formation_uuid AS formation_uuid',
        'f.name AS formation_name',
        'm.job_uuid AS job_uuid',
        'j.name AS job_name',
        'm.organisation_city_uuid AS organisation_city_uuid',
        'oc.name AS organisation_city',
        'm.gender AS gender',
        'm.birth_date AS birth_date',
        'm.phone AS phone',
        'm.phone_whatsapp AS phone_whatsapp',
        'm.email AS email',
        'm.structure_uuid AS structure_uuid',
        's.name AS structure_name',
        'm.department_uuid AS department_uuid',
        'd.name AS department_name',
        'm.division_uuid AS division_uuid',
        'div.name AS division_name',
        'm.has_gohonzon AS has_gohonzon',
        'm.membership_date AS membership_date',
        'm.sokahan_byakuren AS sokahan_byakuren',
        'm.spouse_name AS spouse_name',
        'm.spouse_member AS spouse_member',
        'm.childrens AS childrens',
        'm.tutor_name AS tutor_name',
        'm.tutor_phone AS tutor_phone',
        'm.has_tokusso AS has_tokusso',
        'm.date_tokusso AS date_tokusso',
        'm.has_omamori AS has_omamori',
        'm.date_omamori AS date_omamori',
        'm.longitude AS longitude',
        'm.latitude AS latitude',
      ])
      .where('m.structure_uuid IN (:...uuids)', { uuids: targetSubStructures })
      .andWhere('m.deleted_at IS NULL');

    // Appliquer les filtres selon la catégorie
    switch (category) {
      case 'total':
        break;

      case 'hommes':
        membersQuery = membersQuery.andWhere('m.gender = :gender', { gender: 'homme' });
        break;

      case 'femmes':
        membersQuery = membersQuery.andWhere('m.gender = :gender', { gender: 'femme' });
        break;

      case 'dept_hommes':
        membersQuery = membersQuery
          .andWhere('LOWER(d.name) LIKE :deptName', { deptName: '%homme%' })
          .andWhere('LOWER(d.name) NOT LIKE :notJeune', { notJeune: '%jeune%' });
        break;

      case 'dept_femmes':
        membersQuery = membersQuery
          .andWhere('LOWER(d.name) LIKE :deptName', { deptName: '%femme%' })
          .andWhere('LOWER(d.name) NOT LIKE :notJeune', { notJeune: '%jeune%' });
        break;

      case 'dept_jeunesse':
        membersQuery = membersQuery
          .andWhere('(LOWER(d.name) LIKE :jeune OR LOWER(d.name) LIKE :jeunesse)', {
            jeune: '%jeune%',
            jeunesse: '%jeunesse%'
          });
        break;

      case 'div_jeune_homme':
        membersQuery = membersQuery
          .andWhere('LOWER(div.name) LIKE :jeune', { jeune: '%jeune%' })
          .andWhere('LOWER(div.name) LIKE :homme', { homme: '%homme%' });
        break;

      case 'div_jeune_femme':
        membersQuery = membersQuery
          .andWhere('LOWER(div.name) LIKE :jeune', { jeune: '%jeune%' })
          .andWhere('LOWER(div.name) LIKE :femme', { femme: '%femme%' });
        break;

      case 'div_avenir':
        membersQuery = membersQuery
          .andWhere('LOWER(div.name) LIKE :avenir', { avenir: '%avenir%' });
        break;
    }

    // Appliquer les filtres additionnels
    if (filters?.department_uuid) {
      membersQuery = membersQuery.andWhere('m.department_uuid = :deptUuid', {
        deptUuid: filters.department_uuid,
      });
    }

    if (filters?.division_uuid) {
      membersQuery = membersQuery.andWhere('m.division_uuid = :divUuid', {
        divUuid: filters.division_uuid,
      });
    }

    // Récupérer les membres
    const members = await membersQuery
      .orderBy('m.firstname', 'ASC')
      .addOrderBy('m.lastname', 'ASC')
      .getRawMany();

    // Récupérer les responsabilités
    const memberUuids = members.map(m => m.uuid);
    let memberResponsibilities: any[] = [];
    let memberAccessories: any[] = [];
    let memberTravels: any[] = [];

    if (memberUuids.length > 0) {
      // Responsabilités
      memberResponsibilities = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
        .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
        .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
        .select([
          'm.uuid AS member_uuid',
          'r.uuid AS responsibility_uuid',
          'r.name AS responsibility_name',
          'r.level_uuid AS level_uuid',
          'l.name AS level_name',
          'l.order AS level_order',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();

      // Accessoires
      memberAccessories = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_accessories', 'ma', 'ma.member_uuid = m.uuid AND ma.deleted_at IS NULL')
        .innerJoin('accessories', 'acc', 'acc.uuid = ma.accessory_uuid AND acc.deleted_at IS NULL')
        .select([
          'm.uuid AS member_uuid',
          'acc.uuid AS accessory_uuid',
          'acc.name AS accessory_name',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();

      // Voyages
      memberTravels = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_travels', 'mt', 'mt.member_uuid = m.uuid AND mt.deleted_at IS NULL')
        .leftJoin('countries', 'tc', 'tc.uuid = mt.country_uuid')
        .select([
          'm.uuid AS member_uuid',
          'mt.uuid AS travel_uuid',
          'mt.country_uuid AS travel_country_uuid',
          'tc.name AS travel_country_name',
          'mt.traveled_at AS traveled_at',
          'mt.about AS travel_about',
        ])
        .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
        .andWhere('m.deleted_at IS NULL')
        .orderBy('mt.traveled_at', 'DESC')
        .getRawMany();
    }

    // Grouper les données
    const responsibilitiesMap = new Map<string, any[]>();
    for (const mr of memberResponsibilities) {
      if (!responsibilitiesMap.has(mr.member_uuid)) {
        responsibilitiesMap.set(mr.member_uuid, []);
      }
      responsibilitiesMap.get(mr.member_uuid)!.push({
        uuid: mr.responsibility_uuid,
        name: mr.responsibility_name,
        level_uuid: mr.level_uuid,
        level_name: mr.level_name,
        level_order: mr.level_order,
      });
    }

    const accessoriesMap = new Map<string, any[]>();
    for (const ma of memberAccessories) {
      if (!accessoriesMap.has(ma.member_uuid)) {
        accessoriesMap.set(ma.member_uuid, []);
      }
      accessoriesMap.get(ma.member_uuid)!.push({
        uuid: ma.accessory_uuid,
        name: ma.accessory_name,
      });
    }

    const travelsMap = new Map<string, any[]>();
    for (const mt of memberTravels) {
      if (!travelsMap.has(mt.member_uuid)) {
        travelsMap.set(mt.member_uuid, []);
      }
      travelsMap.get(mt.member_uuid)!.push({
        uuid: mt.travel_uuid,
        country_uuid: mt.travel_country_uuid,
        country_name: mt.travel_country_name,
        traveled_at: mt.traveled_at,
        about: mt.travel_about,
      });
    }

    // Construire les structure trees
    const memberStructureTreeMap = new Map<string, any>();

    for (const m of members) {
      if (!m.structure_uuid) continue;

      const memberResponsibilitiesList = responsibilitiesMap.get(m.uuid) || [];

      if (memberResponsibilitiesList.length > 0) {
        const validResponsibilities = memberResponsibilitiesList.filter(r => r.level_order !== null);

        if (validResponsibilities.length > 0) {
          const highestLevelOrder = Math.min(
            ...validResponsibilities.map(r => parseInt(r.level_order))
          );

          const tree = await this.getStructureTreeForResponsible(
            m.structure_uuid,
            highestLevelOrder
          );

          memberStructureTreeMap.set(m.uuid, tree);
        } else {
          const tree = await this.getStructureTreeForResponsible(
            m.structure_uuid,
            999
          );
          memberStructureTreeMap.set(m.uuid, tree);
        }
      } else {
        const tree = await this.getStructureTreeForResponsible(
          m.structure_uuid,
          999
        );
        memberStructureTreeMap.set(m.uuid, tree);
      }
    }

    // Fonction helper
    const flattenStructureTree = (tree: any, skipFirst = true): { levelNames: string[], structureNames: string[] } => {
      const levelNames: string[] = [];
      const structureNames: string[] = [];

      if (tree) {
        if (!skipFirst) {
          levelNames.push(tree.level_name || '');
          structureNames.push(tree.name || '');
        }

        if (tree.children && tree.children.length > 0) {
          tree.children.forEach((child: any) => {
            const childResults = flattenStructureTree(child, false);
            levelNames.push(...childResults.levelNames);
            structureNames.push(...childResults.structureNames);
          });
        }
      }

      return { levelNames, structureNames };
    };

    const sampleTree = memberStructureTreeMap.values().next().value;
    const { levelNames: structureLevelNames } = sampleTree ? flattenStructureTree(sampleTree, true) : { levelNames: [] };

    // Générer le nom de fichier
    const categoryLabels = {
      total: 'tous_membres',
      hommes: 'hommes',
      femmes: 'femmes',
      dept_hommes: 'departement_hommes',
      dept_femmes: 'departement_femmes',
      dept_jeunesse: 'departement_jeunesse',
      div_jeune_homme: 'division_jeunes_hommes',
      div_jeune_femme: 'division_jeunes_femmes',
      div_avenir: 'division_avenir',
    };

    const fileName = `${categoryLabels[category]}_${await this.generateExportFileName(targetStructureUuid, filters)}`;

    // Créer le job
    const job = await this.exportJobService.createJob(
      'members_stats',
      {
        member_uuid: memberUuid,
        structure_uuid: targetStructureUuid,
        category,
        filters
      },
      user_uuid,
    );

    // Lancer l'export en arrière-plan
    setImmediate(async () => {
      try {
        await this.exportJobService.updateJobProgress(job.uuid, 30);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Membres');

        // Définir TOUTES les colonnes
        const baseColumns = [
          { header: 'Matricule', key: 'matricule', width: 15 },
          { header: 'Nom', key: 'lastname', width: 20 },
          { header: 'Prénom', key: 'firstname', width: 20 },
          { header: 'Genre', key: 'gender', width: 10 },
          { header: 'Date de naissance', key: 'birth_date', width: 15 },
          { header: 'Lieu de naissance', key: 'birth_city', width: 15 },
          { header: 'Civilité', key: 'civility_name', width: 15 },
          { header: 'Situation matrimoniale', key: 'marital_status_name', width: 15 },
          { header: 'Nom du conjoint', key: 'spouse_name', width: 20 },
          { header: 'Membre de la famille', key: 'spouse_member', width: 15 },
          { header: 'Nombre d\'enfants', key: 'childrens', width: 15 },
          { header: 'Pays', key: 'country_name', width: 15 },
          { header: 'Ville', key: 'city_name', width: 15 },
          { header: 'Formation', key: 'formation_name', width: 20 },
          { header: 'Profession', key: 'job_name', width: 20 },
          { header: 'Téléphone', key: 'phone', width: 15 },
          { header: 'WhatsApp', key: 'phone_whatsapp', width: 15 },
          { header: 'Nom du tuteur', key: 'tutor_name', width: 20 },
          { header: 'Téléphone du tuteur', key: 'tutor_phone', width: 15 },
          { header: 'Ville de l\'organisation', key: 'organisation_city', width: 20 },
          { header: 'Accessoires', key: 'accessories', width: 30 },
          { header: 'Voyages', key: 'travels', width: 40 },
          { header: 'Email', key: 'email', width: 25 },
          { header: 'Département', key: 'department_name', width: 20 },
          { header: 'Division', key: 'division_name', width: 20 },
          { header: 'Gohonzon', key: 'has_gohonzon', width: 12 },
          { header: 'Date adhésion', key: 'membership_date', width: 15 },
          { header: 'Sokahan Byakuren', key: 'sokahan_byakuren', width: 15 },
          { header: 'Tokusso', key: 'has_tokusso', width: 12 },
          { header: 'Date Tokusso', key: 'date_tokusso', width: 15 },
          { header: 'Omamori', key: 'has_omamori', width: 12 },
          { header: 'Date Omamori', key: 'date_omamori', width: 15 },
          { header: 'Responsabilités', key: 'responsibilities', width: 40 },
          { header: 'Longitude', key: 'longitude', width: 15 },
          { header: 'Latitude', key: 'latitude', width: 15 },
        ];

        const structureTreeColumns: { header: string; key: string; width: number }[] = [];
        structureLevelNames.forEach((levelName: string, index: number) => {
          structureTreeColumns.push({
            header: levelName || `Structure Niveau ${index + 1}`,
            key: `structure_level_${index}`,
            width: 25,
          });
        });

        worksheet.columns = [...baseColumns, ...structureTreeColumns];

        // Styliser l'en-tête
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4472C4' },
        };
        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // Ajouter les données
        members.forEach(member => {
          const responsibilities = responsibilitiesMap.get(member.uuid) || [];
          const responsibilitiesText = responsibilities
            .map(r => `${r.name} (${r.level_name})`)
            .join(', ');

          const accessories = accessoriesMap.get(member.uuid) || [];
          const accessoriesText = accessories
            .map(a => a.name)
            .join(', ');

          const travels = travelsMap.get(member.uuid) || [];
          const travelsText = travels
            .map(t => {
              const date = t.traveled_at ? new Date(t.traveled_at).toLocaleDateString('fr-FR') : '';
              const country = t.country_name || 'Pays inconnu';
              const about = t.about ? ` (${t.about})` : '';
              return `${country} - ${date}${about}`;
            })
            .join(' | ');

          const tree = memberStructureTreeMap.get(member.uuid);
          const { structureNames: treeFlattened } = tree ? flattenStructureTree(tree, true) : { structureNames: [] };

          const rowData: any = {
            matricule: member.matricule || '',
            lastname: member.lastname || '',
            firstname: member.firstname || '',
            gender: member.gender || '',
            civility_name: member.civility_name || '',
            marital_status_name: member.marital_status_name || '',
            spouse_name: member.spouse_name || '',
            spouse_member: member.spouse_member || '',
            childrens: member.childrens || '',
            country_name: member.country_name || '',
            city_name: member.city_name || '',
            formation_name: member.formation_name || '',
            job_name: member.job_name || '',
            organisation_city: member.organisation_city || '',
            birth_date: member.birth_date ? new Date(member.birth_date).toLocaleDateString('fr-FR') : '',
            birth_city: member.city_name || '',
            phone: member.phone || '',
            phone_whatsapp: member.phone_whatsapp || '',
            tutor_name: member.tutor_name || '',
            tutor_phone: member.tutor_phone || '',
            longitude: member.longitude || '',
            latitude: member.latitude || '',
            email: member.email || '',
            department_name: member.department_name || '',
            division_name: member.division_name || '',
            sokahan_byakuren: member.sokahan_byakuren ? 'Oui' : 'Non',
            has_gohonzon: member.has_gohonzon ? 'Oui' : 'Non',
            has_tokusso: member.has_tokusso ? 'Oui' : 'Non',
            date_tokusso: member.date_tokusso ? new Date(member.date_tokusso).toLocaleDateString('fr-FR') : '',
            has_omamori: member.has_omamori ? 'Oui' : 'Non',
            date_omamori: member.date_omamori ? new Date(member.date_omamori).toLocaleDateString('fr-FR') : '',
            membership_date: member.membership_date ? new Date(member.membership_date).toLocaleDateString('fr-FR') : '',
            responsibilities: responsibilitiesText || '',
            accessories: accessoriesText || '',
            travels: travelsText || '',
          };

          structureLevelNames.forEach((levelName: string, index: number) => {
            rowData[`structure_level_${index}`] = treeFlattened[index] || '';
          });

          worksheet.addRow(rowData);
        });

        // Appliquer les bordures
        worksheet.eachRow((row) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin' },
              left: { style: 'thin' },
              bottom: { style: 'thin' },
              right: { style: 'thin' },
            };
          });
        });

        await this.exportJobService.updateJobProgress(job.uuid, 80);

        // Sauvegarder
        const uploadsDir = path.join(process.cwd(), 'uploads', 'exports');

        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const filePath = path.join(uploadsDir, fileName);
        await workbook.xlsx.writeFile(filePath);

        await this.exportJobService.completeJob(job.uuid, filePath, fileName);

      } catch (error) {
        console.error('Export members stats error:', error);
        await this.exportJobService.updateJobStatus(
          job.uuid,
          ExportJobStatus.FAILED,
          error.message
        );
      }
    });

    return {
      success: true,
      message: 'Export en cours de traitement',
      jobId: job.uuid,
      checkStatusUrl: `/export/status/${job.uuid}`,
    };
  }
}
