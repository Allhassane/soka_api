import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleEntity } from './entities/module.entity';

@Injectable()
export class ModuleService {
  constructor(
    @InjectRepository(ModuleEntity)
    private readonly moduleRepo: Repository<ModuleEntity>,
  ) {}

  async findAll() {
    const modules = await this.moduleRepo.find({
      order: { name: 'ASC' },
    });

    return modules;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const newModule = this.moduleRepo.create({
      name: payload.name,
      admin_uuid: admin_uuid ?? null,
    });

    const saved = await this.moduleRepo.save(newModule);

    return saved;
  }

  async findOne(uuid: string) {
    const module = await this.moduleRepo.findOne({ where: { uuid } });

    if (!module) {
        throw new NotFoundException('Aucun module trouvé');
    }

    return  module;
  }

  async update(uuid: string,payload: any,admin_uuid: string) {
    const { name } = payload;

    if (!uuid || !name || !admin_uuid) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const existing = await this.moduleRepo.findOne({ where: { uuid } });
    if (!existing) {
        throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;

    const updated = await this.moduleRepo.save(existing);

    return updated;
  }

  async delete(uuid: string) {
    const module = await this.moduleRepo.findOne({ where: { uuid } });

    if (!module) {
        throw new NotFoundException('Aucun élément trouvé');
    }

   return await this.moduleRepo.softRemove(module);

  }
}
