import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StructureEntity } from './entities/structure.entity';
import { MemberEntity } from '../members/entities/member.entity';
import { LevelEntity } from '../level/entities/level.entity';
import { ResponsibleInfo, StructureNode } from 'src/shared/interfaces/structure-node.interface';
import { StructureMembersStats } from 'src/shared/interfaces/StructureMembersStats';


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
      };
      divisions: {
        total: number;
        jeune_homme: number;
        jeune_femme: number;
        avenir: number;
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
      .select([
        'm.uuid AS member_uuid',
        'r.uuid AS responsibility_uuid',
        'r.name AS responsibility_name',
      ])
      .where('m.uuid IN (:...uuids)', { uuids: memberUuids })
      .andWhere('m.deleted_at IS NULL')
      .getRawMany();
  }

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

  // 10. Calculer les statistiques (sur tous les membres, pas seulement les paginés)
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

  // 11. Formater les membres paginés avec leurs responsabilités
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

  // 12. Calculer les infos de pagination
  const totalPages = Math.ceil(totalCount / limit);

  // 13. Retourner le résultat
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
    memberUuid: string | null,  // Maintenant c'est le member_uuid
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
    
    if (!member || !member.structure_uuid) {
      throw new NotFoundException('Structure du membre non trouvée');
    }
    
    const memberStructureUuid = member.structure_uuid;

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

    // 2. Récupérer toutes les structures accessibles par l'utilisateur
    const allStructureUuids = await this.getAllSubStructureUuids(memberStructureUuid);

    // 3. Vérifier que la structure cible est accessible
    if (!allStructureUuids.includes(targetStructureUuid)) {
      throw new NotFoundException('Structure non accessible');
    }

    // ... reste du code identique ...
    
    // 4. Récupérer les sous-structures de la cible
    const targetSubStructures = await this.getAllSubStructureUuids(targetStructureUuid);

    // 5. Construire le breadcrumb (chemin hiérarchique)
    const breadcrumb = await this.buildBreadcrumb(targetStructureUuid);

    // 6. Récupérer les filtres disponibles
    const filtersAvailable = await this.getAvailableFilters(memberStructureUuid, filters);

    // 7. Construire la requête pour les membres
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

    // 8. Récupérer les membres
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

    // 9. Calculer les statistiques
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

    // 10. Retourner le résultat
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
        },
        divisions: {
          total: divJeuneHomme + divJeuneFemme + divAvenir,
          jeune_homme: divJeuneHomme,
          jeune_femme: divJeuneFemme,
          avenir: divAvenir,
        },
      },
      breadcrumb,
    };
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
}
