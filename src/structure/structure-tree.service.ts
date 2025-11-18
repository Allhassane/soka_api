import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StructureEntity } from './entities/structure.entity';
import { MemberEntity } from '../members/entities/member.entity';
import { LevelEntity } from '../level/entities/level.entity';
import { ResponsibleInfo, StructureNode } from 'src/shared/interfaces/structure-node.interface';
import { StructureMembersStats } from 'src/shared/interfaces/StructureMembersStats';

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

  async getStructureMembersWithStats(structureUuid: string): Promise<StructureMembersStats> {
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
}
