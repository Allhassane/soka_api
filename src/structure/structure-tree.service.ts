import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StructureEntity } from './entities/structure.entity';
import { MemberEntity } from '../members/entities/member.entity';
import { LevelEntity } from '../level/entities/level.entity';
import { ResponsibleInfo, StructureNode } from 'src/shared/interfaces/structure-node.interface';



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

/*
  async getStructureTreeWithCounts_old(rootUuid?: string): Promise<StructureNode[]> {
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
        sub_groups_count: 0,  // <-- Initialisé à 0
        sub_groups_uuids: [],
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

        // Ajouter l'uuid de l'enfant et tous ses sous-groupes
        allSubGroupUuids.push(child.uuid);
        allSubGroupUuids = allSubGroupUuids.concat(childResult.subGroupUuids);
      }

      node.total_members_count = total;
      node.sub_groups_uuids = allSubGroupUuids;
      node.sub_groups_count = allSubGroupUuids.length;  // <-- Ajouté

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
  }*/

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
}
