import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LevelEntity } from './entities/level.entity';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { v4 as uuidv4 } from 'uuid';
@Injectable()
export class LevelService {
  constructor(
    @InjectRepository(LevelEntity)
    private readonly levelRepo: Repository<LevelEntity>,
  ) {}

  async create(dto: CreateLevelDto) {
    const existing = await this.levelRepo.findOne({
      where: { name: dto.name },
    });

    if (existing) {
      throw new ConflictException('Un niveau avec ce nom existe déjà.');
    }

    const level = this.levelRepo.create({
      ...dto,
      uuid: uuidv4(),
    });

    return this.levelRepo.save(level);
  }

  async findAll(category: string) {
    if (
      category !== 'responsibility' &&
      category !== 'level' &&
      category !== 'all'
    ) {
      throw new NotFoundException('Categorie invalide');
    }

    if (category === 'all') {
      const data = await this.levelRepo.find({
        order: { order: 'ASC' },
      });

      return data;
    } else {
      const data = await this.levelRepo.find({
        where: { category },
        order: { order: 'ASC' },
      });

      return data;
    }
  }

  async findOne(uuid: string) {
    const level = await this.levelRepo.findOne({
      where: { uuid },
    });

    if (!level) {
      throw new NotFoundException('Niveau introuvable');
    }

    return level;
  }

  async findNextLevelByParent(uuid: string) {
    const level = await this.levelRepo.findOne({
      where: { uuid },
    });

    if (!level) {
      throw new NotFoundException('Niveau introuvable');
    }

    const order = level.order + 1;

    const nextLevel = await this.levelRepo.findOne({
      where: { order, category: level.category },
    });

    return nextLevel;
  }

  async update(uuid: string, dto: UpdateLevelDto) {
    const level = await this.findOne(uuid);
    Object.assign(level, dto);
    return this.levelRepo.save(level);
  }

  async delete(uuid: string) {
    const level = await this.levelRepo.findOneBy({ uuid });
    if (!level) {
      throw new NotFoundException('Niveau introuvable.');
    }

    return await this.levelRepo.remove(level);
  }
}
