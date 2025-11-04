import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ModuleEntity } from "src/module/entities/module.entity";
import { Role } from "./entities/role.entity";
import { RoleType } from "src/shared/enums/types.enums";
import { UpdateRoleDto } from "./dtos/update-role.dto";
import { buildPaginationMeta } from "src/shared/helpers/pagination-meta.helper";
import { POSTGRES_ERROR_CODES } from "src/shared/constants/postgres-error-codes.constant";
import { PostgresError } from "src/shared/enums/post-gres.enum";
import { CreateRoleDto } from "./dtos/create-role.dto";
import { Repository } from "typeorm";
import { PermissionEntity } from "src/permission/entities/permission.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { RolePermissionEntity } from "src/role-permission/entities/role-permission.entity";
import { PaginateMeta } from "src/shared/interfaces/paginate-meta.interface";
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,

    @InjectRepository(ModuleEntity)
    private readonly moduleRepository: Repository<ModuleEntity>,

    @InjectRepository(RolePermissionEntity)
    private readonly rolePermissionRepository: Repository<RolePermissionEntity>,

    @InjectRepository(PermissionEntity)
    private readonly permissionRepository: Repository<PermissionEntity>, 
  ) {}

  async onModuleInit() {
    const existing = await this.roleRepository.findOne({
      where: { name: 'superadmin' },
    });

    if (!existing) {
      const role = new Role();
      role.name = 'superadmin';
      role.type = RoleType.PEDAGOGIC;
      await this.roleRepository.save(role);
    }
  }

  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    try {
      const role = this.roleRepository.create(createRoleDto);
      await this.roleRepository.save(role); // d'abord sauver pour avoir uuid
      await this.generateRolePermissions(role.uuid);
      return role;
    } catch (error: unknown) {
      const err = error as PostgresError;
      if (err.code === POSTGRES_ERROR_CODES.UNIQUE_VIOLATION) {
        throw new ConflictException('Ce nom de rôle existe déjà.');
      }
      throw error;
    }
  }

  async findAll(page = 1, limit = 10): Promise<{ data: Role[]; meta: Omit<PaginateMeta, 'page'> }> {
    const [data, total] = await this.roleRepository
      .createQueryBuilder('role')
      .orderBy('role.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
  }

  async findOneByUuid(uuid: string): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { uuid } });
    if (!role) throw new NotFoundException('Rôle non trouvé');
    return role;
  }

  async update(uuid: string, updateDto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOneByUuid(uuid);
    Object.assign(role, updateDto);
    return this.roleRepository.save(role);
  }

  async findLevelsByRoleUuid(uuid: string) {
    const role = await this.findOneByUuid(uuid);
    if (!role.zone_uuid) return [];

    switch (role.type) {
      case RoleType.PEDAGOGIC:
      /*   return this.levelPedagoRepo.find({
          where: { level_uuid: role.zone_uuid },
          order: { created_at: 'DESC' },
        });
      case RoleType.GEOGRAPHIC:
        return this.levelGeoRepo.find({
          where: { level_uuid: role.zone_uuid },
          order: { created_at: 'DESC' },
        }); */
      case RoleType.SCHOOL:
        return [];
      default:
        throw new BadRequestException('Type de rôle non supporté');
    }
  }

  async softDelete(uuid: string): Promise<void> {
    const role = await this.findOneByUuid(uuid);
    await this.roleRepository.softDelete({ id: role.id });
  }

  async findAllPermissions(roleUuid: string): Promise<{ modules: ModuleEntity[]; role: Role }> {
    const role = await this.roleRepository.findOne({ where: { uuid: roleUuid } });
    if (!role) throw new NotFoundException('Aucun rôle trouvé');

    const modules = await this.moduleRepository.find({
      relations: ['permissions'],
      order: { name: 'ASC' },
    });

    for (const module of modules) {
      for (const permission of module.permissions) {
        const rolePerm = await this.rolePermissionRepository.findOne({
          where: { role_uuid: role.uuid, permission_uuid: permission.uuid },
        });

        if (!rolePerm) {
          (permission as any).role_permission_uuid = null;
          (permission as any).status = false;
        } else {
          (permission as any).role_permission_uuid = rolePerm.uuid;
          (permission as any).status = rolePerm.status;
        }
      }
    }

    return { modules, role };
  }

  
async findGlobalPermissions(roleUuid: string): Promise<{
  role: Role;
  modules: any[];
  permissions: any[];
}> {
  const role = await this.roleRepository.findOne({ where: { uuid: roleUuid } });
  if (!role) {
    throw new NotFoundException('Aucun rôle trouvé');
  }

  const modules = await this.moduleRepository.find({
    relations: ['permissions'],
    order: { name: 'ASC' },
  });

  
  const modulesWithPermissions: any[] = [];
  const allPermissions: any[] = [];

  for (const module of modules) {
    const permissionsWithStatus: any[] = [];

    for (const permission of module.permissions) {
      const rolePerm = await this.rolePermissionRepository.findOne({
        where: {
          role_uuid: role.uuid,
          permission_uuid: permission.uuid,
        },
      });

      const permissionWithStatus = {
        ...permission,
        role_permission_uuid: rolePerm ? rolePerm.uuid : null,
        status: rolePerm ? rolePerm.status : false,
        module_uuid: module.uuid,
        module_name: module.name,
      };

      permissionsWithStatus.push(permissionWithStatus); 
      allPermissions.push(permissionWithStatus); 
    }

    modulesWithPermissions.push({
      uuid: module.uuid,
      name: module.name,
      permissions: permissionsWithStatus,
    });
  }

  return {
    role,
    modules: modulesWithPermissions,
    permissions: allPermissions,
  };
}



  async togglePermission(rolePermissionUuid: string): Promise<void> {
    const rolePerm = await this.rolePermissionRepository.findOne({ where: { uuid: rolePermissionUuid } });
    if (!rolePerm) throw new NotFoundException('Aucun élément trouvé');

    rolePerm.status = !rolePerm.status;
    await this.rolePermissionRepository.save(rolePerm);
  }
async generateRolePermissions(roleUuid: string): Promise<void> {
  // Récupère le rôle pour obtenir son ID numérique
  const role = await this.roleRepository.findOne({ where: { uuid: roleUuid } });
  if (!role) throw new NotFoundException('Rôle non trouvé');

  const permissions = await this.permissionRepository.find();

  await Promise.all(
    permissions.map(async (permission) => {
      // Vérifie si la relation existe déjà en utilisant les IDs numériques
      const exists = await this.rolePermissionRepository.findOne({
        where: { role_id: role.id, permission_id: permission.id },
      });

      if (!exists) {
        // Crée la relation avec role_id, permission_id et conserve les UUID
        const rolePermission = this.rolePermissionRepository.create({
          role_id: role.id,
          permission_id: permission.id,
          role_uuid: role.uuid,
          permission_uuid: permission.uuid,
          status: false,
          uuid: uuidv4(), // UUID logique pour API
        });

        await this.rolePermissionRepository.save(rolePermission);
      }
    }),
  );
}

}
