import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { PermissionEntity } from './entities/permission.entity';
import { CreatePermissionsDto } from './dto/create-permissions.dto';
import { UpdatePermissionsDto } from './dto/update-permissions.dto';
import { v4 as uuidv4, v4 } from 'uuid';
import { slugify } from 'transliteration';
import { ModuleEntity } from '../module/entities/module.entity';
import { formatSlug } from '../shared/helpers/format-slug';
@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissionRepository: Repository<PermissionEntity>,
    @InjectRepository(ModuleEntity)
    private readonly modulesRepository: Repository<ModuleEntity>,
  ) {}

 async create(dto: CreatePermissionsDto): Promise<PermissionEntity> {
  const module = await this.modulesRepository.findOne({
    where: { uuid: dto.module_uuid },
  });

  if (!module) {
    throw new NotFoundException('Module introuvable');
  }

  const permission = this.permissionRepository.create({
    name: dto.name,
    slug: formatSlug(module.name, dto.name),
    description: dto.description,
    module_uuid: dto.module_uuid,
    uuid: uuidv4(),
  });

  return await this.permissionRepository.save(permission);
}

async findAll(module_uuid: string): Promise<PermissionEntity[]> {
  // Vérifie que le module existe
  const module = await this.modulesRepository.findOne({ where: { uuid: module_uuid } });
  if (!module) {
    throw new NotFoundException('Module introuvable');
  }

  // Récupère toutes les permissions du module, triées par nom
  const datas = await this.permissionRepository.find({
    where: { module_uuid },
    order: { name: 'ASC' },
  });

  return datas;
}


  async findOne(uuid: string): Promise<PermissionEntity> {
    const permission = await this.permissionRepository.findOne({ where: { uuid } });
    if (!permission) {
      throw new NotFoundException('Permission introuvable');
    }
    return permission;
  }

  async update(uuid: string, dto: UpdatePermissionsDto): Promise<PermissionEntity> {
    const permission = await this.findOne(uuid);

    if (dto.name) {
      permission.name = dto.name;
      permission.slug = slugify(dto.name);
    }
    if (dto.description !== undefined) {
      permission.description = dto.description;
    }

    return this.permissionRepository.save(permission);
  }

  async remove(uuid: string): Promise<{ message: string }> {
    const permission = await this.findOne(uuid);
    await this.permissionRepository.remove(permission);
    return { message: 'Permission supprimée avec succès' };
  }
}
