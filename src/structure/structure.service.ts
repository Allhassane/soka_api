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
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import { PaginateMeta } from 'src/shared/interfaces/paginate-meta.interface';

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

  ) {}

  async findAll(
    page = 1,
    limit = 10,
    search?: string,
  ): Promise<{ data: StructureEntity[]; meta: Omit<PaginateMeta, 'page'> }> {
    const qb = this.structureRepo
      .createQueryBuilder('structure')
      .orderBy('structure.created_at', 'DESC');

    if (search?.trim()) {
      qb.andWhere('structure.name LIKE :search', {
        search: `%${search.trim()}%`,
      });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
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
      select: ['id', 'uuid','name'],
    });
    if (!start) {
      throw new NotFoundException('Nœud de départ introuvable');
    }

    // 2) Exécuter le CTE récursif
    const sql = `
      WITH RECURSIVE tree AS (
        SELECT s.id, s.uuid, s.name, s.parent_id, s.level_uuid
        FROM structures s
        WHERE s.uuid = ?

        UNION ALL

        SELECT c.id, c.uuid, c.name, c.parent_id, c.level_uuid
        FROM structures c
        JOIN tree t ON c.parent_id = t.id
      )
      SELECT sg.*
      FROM tree sg
      JOIN levels l ON l.uuid = sg.level_uuid
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

    // NOTE (audit P10) : l'implementation dupliquee de getStructureTreeForResponsible a ete
    // retiree d'ici (rechargeait tout le dataset a chaque appel, sans cache). L'unique
    // implementation canonique vit dans StructureTreeService (build unique par requete +
    // resolveur memoise via createStructureTreeResolver). Verifie : aucun appelant restant.

  /**
   * « Comité » d'une structure : la structure (avec son niveau + son parent), la liste
   * des responsables qui y sont rattachés (membre + responsabilité + priorité), et les
   * responsabilités du niveau encore vacantes dans cette structure.
   *
   * ⚠ Jointures par *_uuid (pas par les FK entières *_id, NULL sur les données migrées),
   * style identique à auth.service (éprouvé en prod).
   */
  async getCommittee(structureUuid: string) {
    const structure = await this.structureRepo.findOne({
      where: { uuid: structureUuid },
    });
    if (!structure) {
      throw new NotFoundException('Structure introuvable');
    }

    let level: { uuid: string; name: string } | null = null;
    if (structure.level_uuid) {
      const l = await this.levelRepository.findOne({
        where: { uuid: structure.level_uuid },
      });
      if (l) level = { uuid: l.uuid, name: l.name };
    }

    let parent: { uuid: string; name: string } | null = null;
    if (structure.parent_uuid && structure.parent_uuid.trim() !== '') {
      const p = await this.structureRepo.findOne({
        where: { uuid: structure.parent_uuid },
      });
      if (p) parent = { uuid: p.uuid, name: p.name };
    }

    // Responsables rattachés à cette structure (membres de la structure ayant une responsabilité).
    const rows = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin(
        'member_responsibilities',
        'mr',
        'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL',
      )
      .innerJoin(
        'responsibilities',
        'r',
        'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL',
      )
      .select([
        'm.uuid AS member_uuid',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.picture AS picture',
        'm.phone AS phone',
        'm.phone_whatsapp AS phone_whatsapp',
        'm.email AS email',
        'r.uuid AS responsibility_uuid',
        'r.name AS responsibility_name',
        'r.slug AS responsibility_slug',
        'r.gender AS responsibility_gender',
        'mr.priority AS priority',
      ])
      .where('m.structure_uuid = :structureUuid', { structureUuid })
      .andWhere('m.deleted_at IS NULL')
      .getRawMany();

    const responsibles = rows.map((row) => ({
      responsibility: {
        uuid: row.responsibility_uuid,
        name: row.responsibility_name,
        slug: row.responsibility_slug,
        gender: row.responsibility_gender,
      },
      member: {
        uuid: row.member_uuid,
        firstname: row.firstname,
        lastname: row.lastname,
        picture: row.picture ?? null,
        phone: row.phone ?? null,
        phone_whatsapp: row.phone_whatsapp ?? null,
        email: row.email ?? null,
      },
      priority: row.priority ?? 'high',
    }));

    // Responsabilités du niveau de la structure encore non pourvues ici.
    let vacant_responsibilities: Array<{
      uuid: string;
      name: string;
      slug: string;
      gender: string;
    }> = [];
    if (structure.level_uuid) {
      const filledUuids = rows.map((r) => r.responsibility_uuid);
      const qb = this.memberRepository.manager
        .createQueryBuilder()
        .select([
          'r.uuid AS uuid',
          'r.name AS name',
          'r.slug AS slug',
          'r.gender AS gender',
        ])
        .from('responsibilities', 'r')
        .where('r.level_uuid = :levelUuid', { levelUuid: structure.level_uuid })
        .andWhere('r.deleted_at IS NULL')
        .andWhere("r.status = 'enable'");
      if (filledUuids.length > 0) {
        qb.andWhere('r.uuid NOT IN (:...filledUuids)', { filledUuids });
      }
      vacant_responsibilities = await qb.getRawMany();
    }

    return {
      structure: {
        uuid: structure.uuid,
        name: structure.name,
        level,
        parent,
      },
      responsibles,
      vacant_responsibilities,
    };
  }

  /**
   * « Mon comité » : comité de la structure de l'utilisateur connecté. On prend en
   * priorité la structure de sa responsabilité, sinon la structure de son membre.
   */
  async getMyCommittee(user: {
    member_uuid?: string | null;
    responsibilities?: Array<{ structure?: { uuid?: string } | null }>;
  }) {
    let structureUuid: string | undefined =
      user?.responsibilities?.[0]?.structure?.uuid;

    if (!structureUuid && user?.member_uuid) {
      const member = await this.memberRepository.findOne({
        where: { uuid: user.member_uuid },
      });
      structureUuid = member?.structure_uuid ?? undefined;
    }

    if (!structureUuid) {
      throw new NotFoundException('Aucune structure rattachée à votre compte.');
    }

    return this.getCommittee(structureUuid);
  }

}
