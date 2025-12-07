import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StructureEntity } from './entities/structure.entity';
import { MemberEntity } from '../members/entities/member.entity';
import { LevelEntity } from '../level/entities/level.entity';
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
  centre_uuid?: string;
  chapitre_uuid?: string;
  district_uuid?: string;
  groupe_uuid?: string;
  department_uuid?: string;
  division_uuid?: string;
}

export interface MemberStatsResponse {
  filters_available: {
    regions: { uuid: string; name: string }[];
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

    private exportJobService: ExportJobService,
     private exportProcessorService: ExportProcessorService,

  ) { }


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

  public async getStructureTreeForResponsible(
    structureUuid: string,
    responsibleLevelOrder: number
  ): Promise<any> {
    // Récupérer toutes les structures
    const structures = await this.structureRepository
      .createQueryBuilder('s')
      .where('s.deleted_at IS NULL')
      .getMany();

    if (structures.length === 0) return null;

    // Récupérer tous les niveaux
    const levels = await this.levelRepository.find();
    const levelsMap = new Map(levels.map(l => [l.uuid, { name: l.name, order: l.order }]));

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

    // Construire la map des structures
    const structureMap = new Map<string, any>();

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

    // Construire l'arbre complet
    const rootNodes: any[] = [];

    for (const node of structureMap.values()) {
      if (node.parent_uuid && structureMap.has(node.parent_uuid)) {
        const parent = structureMap.get(node.parent_uuid)!;
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    // Calculer les totaux
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

    // Trouver la structure du responsable
    const targetStructure = structureMap.get(structureUuid);
    if (!targetStructure) return null;

    // Remonter jusqu'à la racine pour construire le chemin
    const pathToRoot: string[] = [];
    let currentUuid = structureUuid;

    while (currentUuid) {
      pathToRoot.push(currentUuid);
      const current = structureMap.get(currentUuid);
      currentUuid = current?.parent_uuid;
    }

    // Trouver la racine
    const rootUuid = pathToRoot[pathToRoot.length - 1];
    const rootStructure = structureMap.get(rootUuid);
    if (!rootStructure) return null;

    // Filtrer l'arbre : garder le chemin vers la structure cible et couper au niveau de responsabilité
    const filterTree = (node: any, pathUuids: string[], targetLevelOrder: number): any => {
      const { level_order, ...nodeWithoutOrder } = node;
      const isOnPath = pathUuids.includes(node.uuid);
      const isTarget = node.uuid === structureUuid;

      // Si c'est la structure cible, couper les enfants (s'arrêter à son niveau)
      if (isTarget) {
        return {
          ...nodeWithoutOrder,
          children: [],
        };
      }

      // Si on est sur le chemin vers la cible, garder seulement l'enfant qui mène à la cible
      if (isOnPath) {
        const filteredChildren = node.children
          .filter((child: any) => pathUuids.includes(child.uuid))
          .map((child: any) => filterTree(child, pathUuids, targetLevelOrder));

        return {
          ...nodeWithoutOrder,
          children: filteredChildren,
        };
      }

      // Sinon, ne pas inclure ce nœud
      return null;
    };

    return filterTree(rootStructure, pathToRoot, responsibleLevelOrder);
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
    console.log(structureUuid)
    if (!member || !structureUuid) {
      throw new NotFoundException('Structure du membre non trouvée');
    }

    // Paramètres de pagination par défaut
    const page = paginationParams?.page || 1;
    const limit = paginationParams?.limit || 25;
    const offset = (page - 1) * limit;

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

    for (const m of members) {
      if (!m.structure_uuid) continue;

      const memberResponsibilitiesList = responsibilitiesMap.get(m.uuid) || [];

      // Si le membre a des responsabilités, utiliser le niveau le plus haut
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
          // Pas de level_order valide, utiliser l'arbre complet
          const tree = await this.getStructureTreeForResponsible(
            m.structure_uuid,
            999
          );
          memberStructureTreeMap.set(m.uuid, tree);
        }
      } else {
        // Pas de responsabilité, afficher l'arbre complet depuis sa structure
        const tree = await this.getStructureTreeForResponsible(
          m.structure_uuid,
          999
        );
        memberStructureTreeMap.set(m.uuid, tree);
      }
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

      // Si le membre a des responsabilités, utiliser le niveau le plus haut
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
          // Pas de level_order valide, utiliser l'arbre complet
          const tree = await this.getStructureTreeForResponsible(
            m.structure_uuid,
            999
          );
          memberStructureTreeMap.set(m.uuid, tree);
        }
      } else {
        // Pas de responsabilité, afficher l'arbre complet depuis sa structure
        const tree = await this.getStructureTreeForResponsible(
          m.structure_uuid,
          999
        );
        memberStructureTreeMap.set(m.uuid, tree);
      }
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
    const fileName = `membres_export_${new Date().toISOString().split('T')[0]}.xlsx`;

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
  private async getAllSubStructureUuids(structureUuid: string): Promise<string[]> {
    const result: string[] = [structureUuid];

    const children = await this.structureRepository.find({
      where: { parent_uuid: structureUuid },
      select: ['uuid'],
    });

    for (const child of children) {
      const childUuids = await this.getAllSubStructureUuids(child.uuid);
      result.push(...childUuids);
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

    if (!member || !responsibility_structure_uuid) {
      throw new NotFoundException('Structure du membre non trouvée');
    }

    const memberStructureUuid = responsibility_structure_uuid;

    // 1. Déterminer la structure de base selon les filtres
    let targetStructureUuid = memberStructureUuid;

    if (filters?.groupe_uuid) {
      targetStructureUuid = filters.groupe_uuid;
    } else if (filters?.district_uuid) {
      targetStructureUuid = filters.district_uuid;
    } else if (filters?.chapitre_uuid) {
      targetStructureUuid = filters.chapitre_uuid;
    } else if (filters?.centre_uuid) {
      targetStructureUuid = filters.centre_uuid;
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
      } else if (levelName === 'CENTRE') {
        breadcrumb.centre = { uuid: structure.uuid, name: structure.name };
      } else if (levelName === 'CHAPITRE') {
        breadcrumb.chapitre = { uuid: structure.uuid, name: structure.name };
      } else if (levelName === 'DISTRICT') {
        breadcrumb.district = { uuid: structure.uuid, name: structure.name };
      } else if (levelName === 'GROUPE') {
        breadcrumb.groupe = { uuid: structure.uuid, name: structure.name };
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
      centres: [] as { uuid: string; name: string }[],
      chapitres: [] as { uuid: string; name: string }[],
      districts: [] as { uuid: string; name: string }[],
      groupes: [] as { uuid: string; name: string }[],
    };

    for (const s of structures) {
      const levelName = s.level_name?.toUpperCase();
      const item = { uuid: s.uuid, name: s.name };

      if (levelName === 'REGION') {
        filters.regions.push(item);
      } else if (levelName === 'CENTRE') {
        // Filtrer par région si sélectionnée
        if (!currentFilters?.region_uuid || s.parent_uuid === currentFilters.region_uuid) {
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
    throw new ForbiddenException('Vous n\'avez pas accès à ce fichier');
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

  // ✅ Lancer le traitement en arrière-plan AVEC le workbook
  setImmediate(async () => {
    try {
      // Gestion des filtres de structure
      let baseStructureUuid = structure_uuid;

      if (filterParams?.region_uuid) baseStructureUuid = filterParams.region_uuid;
      if (filterParams?.centre_uuid) baseStructureUuid = filterParams.centre_uuid;
      if (filterParams?.chapitre_uuid) baseStructureUuid = filterParams.chapitre_uuid;
      if (filterParams?.district_uuid) baseStructureUuid = filterParams.district_uuid;
      if (filterParams?.groupe_uuid) baseStructureUuid = filterParams.groupe_uuid;

      await this.exportJobService.updateJobProgress(job.uuid, 30);

      // ✅ Générer le workbook ICI (dans le même service)
      const workbook = await this.generateMembersWorkbook(
        member_uuid,
        baseStructureUuid,
        filterParams,
      );

      await this.exportJobService.updateJobProgress(job.uuid, 60);

      // ✅ Passer le workbook au processor
      await this.exportProcessorService.processMembersExport(job.uuid, workbook);

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

  const fileName = `membres_export_${new Date().toISOString().split('T')[0]}.xlsx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

  await workbook.xlsx.write(res);
  res.end();
}



// ... vos autres imports et code existant

// Ajoutez cette méthode dans StructureTreeService
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

    const tree = memberStructureTreeMap.get(member.uuid);
    const { structureNames: treeFlattened } = tree ? flattenStructureTree(tree, true) : { structureNames: [] };

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

  //  Retourner le workbook au lieu de l'envoyer via res
  return workbook;
}


}
