import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StructureEntity } from './entities/structure.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { CreateStructureDto } from './dto/create-structure.dto';
import { UpdateStructureDto } from './dto/update-structure.dto';

@Injectable()
export class StructureService {
  constructor(
    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,
    private readonly logService: LogActivitiesService,
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

    const newStructure = this.structureRepo.create({
      name: createStructureDto.name,
      ...(admin_uuid ? { admin_uuid } : {}),
      ...(createStructureDto.parent_uuid
        ? { parent_uuid: createStructureDto.parent_uuid }
        : {}),
      ...(createStructureDto.parent_uuid ? { parent: parent ?? null } : {}),
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

  async findChildrens(uuid: string | undefined) {
    const structure = await this.findOne(uuid);

    const childrens = await this.structureRepo.find({
      where: { parent_uuid: structure.uuid },
    });

    return {
      parent: structure,
      childrens,
    };
  }

  async update(uuid: string, updateStructureDto: UpdateStructureDto) {
    const existing = await this.findOne(uuid);

    let parent: StructureEntity | null = null;
    if (updateStructureDto.parent_uuid) {
      parent = await this.findOne(updateStructureDto.parent_uuid);
    }

    existing.name = updateStructureDto.name;
    existing.parent_uuid = updateStructureDto.parent_uuid;
    existing.parent = parent ?? null;

    const updated = await this.structureRepo.save(existing);

    return updated;
  }

  async delete(uuid: string) {
    const structure = await this.findOne(uuid);

    return await this.structureRepo.remove(structure);
  }
}
