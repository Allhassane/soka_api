import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Level } from './entities/level.entity';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { v4 as uuidv4 } from 'uuid';
import { AccessControlService } from '../shared/services/access-control.service';
import { slugify } from 'transliteration';
import { PaginateMeta } from 'src/shared/interfaces/paginate-meta.interface';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';

type PedagogicCountItem = {
  level_uuid: string;
  count: number;
  level_name?: string;
  level_slug?: string;
};

type PedagogicCountsResponse = {
  total?: number;
  items: PedagogicCountItem[];
};

@Injectable()
export class LevelService {
  constructor(
    @InjectRepository(Level)
    private readonly repo: Repository<Level>,
    private readonly access: AccessControlService,
  ) {}

  async create(dto: CreateLevelDto, admin_uuid: string): Promise<Level> {
    const slug = slugify(dto.name);

    const existing = await this.repo.findOne({ where: { slug } });
    if (existing) {
      throw new ConflictException('Un niveau avec ce nom existe déjà.');
    }

    const level = this.repo.create({
      ...dto,
      uuid: uuidv4(),
      slug,
      admin_uuid,
    });

    return this.repo.save(level);
  }

  async findAll(
    page = 1,
    limit = 10,
    category: string,
  ): Promise<{
    data: Level[];
    meta: Omit<PaginateMeta, 'page'>;
  }> {
    const [data, total] = await this.repo
      .createQueryBuilder('level')
      .leftJoinAndSelect('level.level_geographics', 'level_geographics')
      .where('level.category = :category', { category })
      .orderBy('level.order', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: buildPaginationMeta({
        total,
        page,
        perPage: limit,
      }),
    };
  }

  async findOne(uuid: string, admin_uuid: string): Promise<Level> {
    const level = await this.repo.findOne({
      where: { uuid },
      relations: ['level_geographics'], // relation inverse
    });

    if (!level) {
      throw new NotFoundException('Niveau introuvable');
    }

    this.access.checkOwnership('find_one_level', admin_uuid);
    return level;
  }

  async update(
    uuid: string,
    dto: UpdateLevelDto,
    admin_uuid: string,
  ): Promise<Level> {
    const level = await this.findOne(uuid, admin_uuid);

    if (dto.name && slugify(dto.name) !== level.slug) {
      const newSlug = slugify(dto.name);
      const exists = await this.repo.findOne({ where: { slug: newSlug } });
      if (exists && exists.uuid !== uuid) {
        throw new ConflictException('Un autre niveau avec ce nom existe déjà.');
      }
      level.slug = newSlug;
    }

    Object.assign(level, dto);
    return this.repo.save(level);
  }

  async changeStatut(
    uuid: string,
    statut: 'enable' | 'disable' | 'delete',
    admin_uuid: string,
  ): Promise<Level> {
    const level = await this.findOne(uuid, admin_uuid);
    level.status = statut;
    level.updated_at = new Date();
    level.deleted_at = new Date();
    return this.repo.save(level);
  }

  async delete(uuid: string, admin_uuid: string): Promise<Level> {
    const level = await this.repo.findOneBy({ uuid });
    if (!level) {
      throw new NotFoundException('Niveau introuvable.');
    }

    return await this.changeStatut(uuid, 'delete', admin_uuid);
    //this.repo.softRemove(level);
  }

}
