import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { StructureEntity } from './entities/structure.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { CreateStructureDto } from './dto/create-structure.dto';
import { UpdateStructureDto } from './dto/update-structure.dto';
import { LevelService } from 'src/level/level.service';

@Injectable()
export class StructureService {
  constructor(
    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,
    private readonly logService: LogActivitiesService,
    private readonly levelService: LevelService,
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
}
