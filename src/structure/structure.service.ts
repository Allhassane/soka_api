import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { StructureEntity } from './entities/structure.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { CreateStructureDto } from './dto/create-structure.dto';
import { UpdateStructureDto } from './dto/update-structure.dto';
import { LevelService } from 'src/level/level.service';
import { v4 as uuidv4 } from 'uuid';
import { MemberEntity } from 'src/members/entities/member.entity';
import { LevelEntity } from 'src/level/entities/level.entity';
import { CommitteeResponseDto } from './dto/committee-response.dto';
import { MemberResponsibilityEntity } from 'src/⁠member-responsibility/entities/member-responsibility.entity';
import { ResponsibilityEntity } from 'src/responsibilities/entities/responsibility.entity';
@Injectable()
export class StructureService {
  constructor(
    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,
    @InjectRepository(MemberEntity)
    private memberRepository: Repository<MemberEntity>,
    @InjectRepository(LevelEntity)
    private levelRepository: Repository<LevelEntity>,

    private readonly logService: LogActivitiesService,
    private readonly levelService: LevelService,

    @InjectRepository(MemberResponsibilityEntity)
    private memberRespRepo: Repository<MemberResponsibilityEntity>,

    @InjectRepository(ResponsibilityEntity)
    private responsibilityRepo: Repository<ResponsibilityEntity>,

  ) {}

  async findAll() {
    const data = await this.structureRepo.find();

    return data;
  }

  async create(createStructureDto: CreateStructureDto, admin_uuid?: string) {
    let parent;
    if (createStructureDto.parent_uuid) {
      parent = await this.findOne(createStructureDto.parent_uuid);
    }

    let level;
    if (parent) {
      level = await this.levelService.findNextLevelByParent(
        parent.level_uuid as string,
      );
    }


    const newStructure = this.structureRepo.create({
      uuid: createStructureDto.uuid ?? uuidv4(),
      name: createStructureDto.name,
      ...(admin_uuid ? { admin_uuid } : {}),
      ...(createStructureDto.parent_uuid
        ? { parent_uuid: createStructureDto.parent_uuid }
        : {}),
      ...(level ? { level_uuid: level.uuid } : {}),
      ...(createStructureDto.parent_uuid ? { parent: parent ?? null } : {}),
      ...(level ? { level: level ?? null } : {}),
    });

    const saved = await this.structureRepo.save(newStructure);
    return saved;
  }

  async findOne(uuid: string | undefined) {
    const structure = await this.structureRepo.findOne({ where: { uuid } });

    if (!structure) {
      throw new NotFoundException('Aucune structure trouvé');
    }

    return structure;
  }

  async findOneWithoutParent() {
    const structure = await this.structureRepo.findOne({
      where: { parent_uuid: IsNull() },
    });

    if (!structure) {
      throw new NotFoundException('Aucune structure trouvée');
    }

    return structure;
  }

  async findChildrens(uuid: string | undefined) {
    if (uuid === undefined || uuid === null) {
      const structure = await this.findOneWithoutParent();

      const childrens = await this.structureRepo.find({
        where: { parent_uuid: structure.uuid },
      });

      return {
        structure,
        childrens,
      };
    } else {
      const structure = await this.findOne(uuid);

      const childrens = await this.structureRepo.find({
        where: { parent_uuid: structure.uuid },
      });

      return {
        parent: structure,
        childrens,
      };
    }
  }

  async findByChildrens(uuid: string | undefined) {
    if (uuid === undefined || uuid === null) {
      const structure = await this.findOneWithoutParent();

      return structure;
    } else {
      const structure = await this.findOne(uuid);

      const childrens = await this.structureRepo.find({
        where: { parent_uuid: structure.uuid },
      });

      return childrens;
    }
  }

  async update(uuid: string, updateStructureDto: UpdateStructureDto) {
    const existing = await this.findOne(uuid);

    if (!updateStructureDto.name) {
      throw new BadRequestException('Le nom de la structure est requis');
    }

    let parent: StructureEntity | null = null;
    if (updateStructureDto.parent_uuid) {
      parent = await this.findOne(updateStructureDto.parent_uuid);
    }

    existing.name = updateStructureDto.name;
    existing.parent_uuid = updateStructureDto.parent_uuid;
    existing.parent = parent ?? null;

    let level;
    if (parent) {
      level = await this.levelService.findNextLevelByParent(parent.uuid);
    }

    existing.level_uuid = level?.uuid;
    existing.level = level ?? null;

    const updated = await this.structureRepo.save(existing);

    return updated;
  }

  async delete(uuid: string) {
    const structure = await this.findOne(uuid);

    return await this.structureRepo.remove(structure);
  }

  async findByLevel(level_uuid: string) {
    const level = await this.levelService.findOne(level_uuid);

    const data = await this.structureRepo.find({
      where: { level_uuid },
    });

    return {
      level,
      data,
    };
  }

  async findByAllChildrens(uuid: string) {
    // 1) Vérifier que le point de départ existe
    const start = await this.structureRepo.findOne({
      where: { uuid },
      select: ['id', 'uuid'],
    });
    if (!start) {
      throw new NotFoundException('Nœud de départ introuvable');
    }

    // 2) Exécuter le CTE récursif
    const sql = `
      WITH RECURSIVE tree AS (
        SELECT s.id, s.uuid, s.name, s.parent_id, s.level_id
        FROM structures s
        WHERE s.uuid = ?

        UNION ALL

        SELECT c.id, c.uuid, c.name, c.parent_id, c.level_id
        FROM structures c
        JOIN tree t ON c.parent_id = t.id
      )
      SELECT sg.*
      FROM tree sg
      JOIN levels l ON l.id = sg.level_id
      WHERE l.\`order\` = 7
      ORDER BY sg.name ASC
    `;

    const rows = await this.structureRepo.query(sql, [uuid]);
    const sousGroups: string[] = [];
    for (const row of rows) {
      sousGroups.push(row.uuid);
    }
    return sousGroups;
  }


  async findWithLevel(structureUuids?: string[]) {
    if (!structureUuids || structureUuids.length === 0) {
      return [];
    }

    const structures = await this.structureRepo.find({
      where: { uuid: In(structureUuids) },
      relations: ['level'],
    });

    return structures;
  }

    public async getStructureTreeForResponsible(
    structureUuid: string,
    responsibleLevelOrder: number
  ): Promise<any> {
    // Récupérer toutes les structures
    const structures = await this.structureRepo
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


async getCommitteeByStructure(structureUuid: string) {

  // 1. Structure
  const structure = await this.structureRepo.findOne({
    where: { uuid: structureUuid },
    relations: ['level', 'parent'],
  });

  if (!structure) {
    throw new NotFoundException('Structure non trouvée');
  }

  // 2. Responsables (directement depuis member_responsibility)
  const memberResponsibilities = await this.memberRespRepo
    .createQueryBuilder('mr')
    .innerJoinAndSelect('mr.member', 'm')
    .innerJoinAndSelect('mr.responsibility', 'r')
    .where('mr.structure_uuid = :uuid', { uuid: structureUuid }) 
    .andWhere('mr.member_id IS NOT NULL')
    .andWhere('mr.responsibility_id IS NOT NULL')
    .getMany();

  // 3. Filtrer pour éviter les null (clé du problème)
  const validMR = memberResponsibilities.filter(
    mr => mr.member && mr.responsibility
  );

  // 4. Construire responsables
  const responsibles = validMR.map(mr => ({
    responsibility: {
      uuid: mr.responsibility!.uuid,
      name: mr.responsibility!.name,
      slug: mr.responsibility!.slug,
      gender: mr.responsibility!.gender,
    },
    member: {
      uuid: mr.member!.uuid,
      firstname: mr.member!.firstname,
      lastname: mr.member!.lastname,
      picture: mr.member!.picture,
      phone: mr.member!.phone,
      phone_whatsapp: mr.member!.phone_whatsapp,
      email: mr.member!.email,
    },
  }));

  // 5. Toutes les responsabilités (référentiel)
  const allResponsibilities = await this.responsibilityRepo.find();

  // 6. Responsabilités occupées
  const occupiedIds = new Set(
    validMR.map(mr => mr.responsibility!.id)
  );

  // 7. Responsabilités vacantes
  const vacant_responsibilities = allResponsibilities
    .filter(r => !occupiedIds.has(r.id))
    .map(r => ({
      uuid: r.uuid,
      name: r.name,
      slug: r.slug,
      gender: r.gender,
    }));

  // 8. Retour final
  return {
    structure: {
      uuid: structure.uuid,
      name: structure.name,
      level: structure.level
        ? {
            uuid: structure.level.uuid,
            name: structure.level.name,
          }
        : null,
      parent: structure.parent
        ? {
            uuid: structure.parent.uuid,
            name: structure.parent.name,
          }
        : null,
    },
    responsibles,
    vacant_responsibilities,
  };
}

}
