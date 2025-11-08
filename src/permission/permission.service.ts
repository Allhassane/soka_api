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
import { AssignPermissionToRoleDto } from './dto/assign-permission-to-role.dto';
import { RevokePermissionFromRoleDto } from './dto/revoke-permission-from-role.dto';
import { Role } from 'src/roles/entities/role.entity';
import { RolePermissionEntity } from 'src/role-permission/entities/role-permission.entity';
import { UserRole } from 'src/user-roles/entities/user-roles.entity';
import { User } from 'src/users/entities/user.entity';
@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(PermissionEntity)
    private readonly permissionRepository: Repository<PermissionEntity>,
    @InjectRepository(ModuleEntity)
    private readonly modulesRepository: Repository<ModuleEntity>,
    
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepo: Repository<RolePermissionEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    
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

  
  async search(keyword: string): Promise<PermissionEntity[]> {
    const kw = `%${keyword}%`;
    return this.permissionRepository.find({
      where: [{ name: ILike(kw) }, { slug: ILike(kw) }],
      order: { created_at: 'DESC' },
    });
  }

  async findOneByUuid(uuid: string): Promise<PermissionEntity> {
    const p = await this.permissionRepository.findOne({ where: { uuid } });
    if (!p) throw new NotFoundException('Permission non trouvée');
    return p;
  }


  async assignToRole(dto: AssignPermissionToRoleDto): Promise<void> {
    const role = await this.roleRepo.findOne({
      where: { uuid: dto.role_uuid },
    });
    if (!role) throw new NotFoundException('Rôle introuvable');

    const perm = await this.permissionRepository.findOne({
      where: { uuid: dto.permission_uuid },
    });
    if (!perm) throw new NotFoundException('Permission introuvable');

    const exists = await this.rolePermissionRepo.findOne({
      where: { role_id: role.id, permission_id: perm.id },
    });
    if (exists) return;

    const link = this.rolePermissionRepo.create({
      role_id: role.id,
      permission_id: perm.id,
    });
    await this.rolePermissionRepo.save(link);
  }

  async revokeFromRole(dto: RevokePermissionFromRoleDto): Promise<void> {
    const role = await this.roleRepo.findOne({
      where: { uuid: dto.role_uuid },
    });
    if (!role) throw new NotFoundException('Rôle introuvable');

    const perm = await this.permissionRepository.findOne({
      where: { uuid: dto.permission_uuid },
    });
    if (!perm) throw new NotFoundException('Permission introuvable');

    const link = await this.rolePermissionRepo.findOne({
      where: { role_id: role.id, permission_id: perm.id },
    });
    if (!link) return;
    await this.rolePermissionRepo.remove(link);
  }

  async listRolePermissions(role_uuid: string): Promise<PermissionEntity[]> {
    const role = await this.roleRepo.findOne({ where: { uuid: role_uuid } });
    if (!role) throw new NotFoundException('Rôle introuvable');

    const rows = await this.rolePermissionRepo
      .createQueryBuilder('rp')
      .innerJoinAndSelect('rp.permission', 'p')
      .where('rp.role_id = :rid', { rid: role.id })
      .orderBy('p.slug', 'ASC')
      .getMany();

    return rows.map((r) => r.permission);
  }

  async listUserEffectivePermissions(user_uuid: string): Promise<PermissionEntity[]> {
    const user = await this.userRepo.findOne({ where: { uuid: user_uuid } });
    if (!user) throw new NotFoundException('Utilisateur introuvable');

    const rows = await this.rolePermissionRepo
      .createQueryBuilder('rp')
      .innerJoin('rp.permission', 'p')
      .innerJoin(UserRole, 'ur', 'ur.role_id = rp.role_id')
      .where('ur.user_uuid = :u', { u: user_uuid })
      .select([
        'p.id AS id',
        'p.uuid AS uuid',
        'p.name AS name',
        'p.slug AS slug',
      ])
      .distinct(true)
      .orderBy('p.slug', 'ASC')
      .getRawMany();

    return rows.map((r) => {
      const perm = new PermissionEntity();
      perm.id = r.id;
      perm.uuid = r.uuid;
      perm.name = r.name;
      perm.slug = r.slug;
      return perm;
    });
  }
}
