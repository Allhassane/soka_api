import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ModuleEntity } from 'src/module/entities/module.entity';
import { Role, RoleStatus } from './entities/role.entity';
import { UpdateRoleDto } from './dtos/update-role.dto';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import { CreateRoleDto } from './dtos/create-role.dto';
import { In, Repository } from 'typeorm';
import { PermissionEntity } from 'src/permission/entities/permission.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { RolePermissionEntity } from 'src/role-permission/entities/role-permission.entity';
import { PaginateMeta } from 'src/shared/interfaces/paginate-meta.interface';
import { v4 as uuidv4 } from 'uuid';
import { slugify } from 'transliteration';
import {
  ROLE_ADMIN_SLUG,
  ROLE_RESPONSABLE_SLUG,
  ROLE_MEMBRE_SLUG,
  SYSTEM_ROLE_SLUGS,
} from 'src/shared/constants/constants';

/** Rôle enrichi du drapeau `is_system` - un rôle système n'est ni renommable ni désactivable. */
export type RoleListItem = Role & { is_system: boolean };

/** Compte-rendu d'une bascule « tout cocher / tout décocher » sur un module. */
export interface ModulePermissionsResult {
  module_uuid: string;
  status: boolean;
  updated: number;
  created: number;
}

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
    // Seeds de référence : ne pas exécuter au démarrage d'une base déjà peuplée.
    // À activer explicitement avec RUN_SEEDS=true sur une base vierge.
    if (process.env.RUN_SEEDS !== 'true') return;

    // L'application n'a que 3 rôles : ADMINISTRATEUR / RESPONSABLE / MEMBRE.
    const targets = [
      { name: 'ADMINISTRATEUR', slug: ROLE_ADMIN_SLUG },
      { name: 'RESPONSABLE', slug: ROLE_RESPONSABLE_SLUG },
      { name: 'MEMBRE', slug: ROLE_MEMBRE_SLUG },
    ];

    for (const t of targets) {
      const exists = await this.roleRepository.findOne({ where: { slug: t.slug } });
      // `save()` échouerait ici (`roles.id` sans défaut) : même chemin d'INSERT que `create()`.
      // Les 3 libellés se slugifient exactement en ROLE_*_SLUG.
      if (!exists) await this.insertRole(t.name);
    }
  }

  /** Un rôle système pilote la dérivation des droits au login : intouchable hors permissions. */
  private isSystemRole(role: Role): boolean {
    return SYSTEM_ROLE_SLUGS.includes((role.slug ?? '').toLowerCase());
  }

  private assertNotSystemRole(role: Role, action: string): void {
    if (this.isSystemRole(role)) {
      throw new ForbiddenException(
        `Le rôle « ${role.name} » est un rôle système : il ne peut pas être ${action}.`,
      );
    }
  }

  /**
   * Refuse (409) un nom déjà porté par un autre rôle non supprimé.
   * Comparaison insensible à la casse sur le nom ET sur le slug dérivé (deux libellés différents
   * peuvent produire le même slug). ⚠️ La base ne porte AUCUN index unique sur `name`/`slug` :
   * ce contrôle applicatif est le seul garde-fou.
   */
  private async assertNameAvailable(
    name: string,
    excludeUuid?: string,
  ): Promise<void> {
    const query = this.roleRepository
      .createQueryBuilder('role')
      .where('(LOWER(role.name) = LOWER(:name) OR LOWER(role.slug) = :slug)', {
        name,
        slug: slugify(name),
      });

    if (excludeUuid) {
      query.andWhere('role.uuid != :excludeUuid', { excludeUuid });
    }

    if (await query.getOne()) {
      throw new ConflictException('Ce nom de rôle existe déjà.');
    }
  }

  /**
   * INSERT explicite : en base `roles.id` est un CHAR(36) sans AUTO_INCREMENT ni DEFAULT
   * (cf. commentaire de l'entité). On lui donne donc la même valeur que `uuid`, comme les
   * 3 lignes historiques - c'est ce qui rendait `roleRepository.save(<rôle neuf>)` impossible.
   */
  private async insertRole(name: string): Promise<Role> {
    const uuid = uuidv4();

    await this.roleRepository.query(
      'INSERT INTO `roles` (`id`, `uuid`, `name`, `slug`, `status`, `created_at`, `updated_at`) ' +
        "VALUES (?, ?, ?, ?, 'enable', NOW(), NOW())",
      [uuid, uuid, name, slugify(name)],
    );

    return this.findOneByUuid(uuid);
  }

  async create(createRoleDto: CreateRoleDto): Promise<Role> {
    await this.assertNameAvailable(createRoleDto.name);

    const role = await this.insertRole(createRoleDto.name);
    await this.generateRolePermissions(role.uuid);

    return role;
  }

  /**
   * Permissions **actives** portées par un lot de rôles, dédoublonnées par slug.
   *
   * C'est la brique de la fusion des droits au login : un utilisateur tient ses rôles de
   * `user_roles` ET des comités auxquels il appartient — une permission lui est accordée dès
   * qu'**au moins un** de ces rôles la porte (union, jamais d'intersection).
   *
   * Une seule requête, quel que soit le nombre de rôles (à opposer à `findGlobalPermissions`,
   * qui fait une requête par permission et ne sert qu'à l'écran d'administration d'un rôle).
   * Les rôles supprimés ou **désactivés** sont ignorés : un rôle `status = 'disable'` n'accorde
   * plus rien, y compris via un comité.
   */
  async findActivePermissionsForRoleUuids(roleUuids: string[]): Promise<any[]> {
    const uniques = Array.from(
      new Set((roleUuids ?? []).filter((uuid): uuid is string => !!uuid)),
    );
    if (uniques.length === 0) return [];

    // Jointures sur les colonnes `*_uuid` : `roles_permissions.role_id`/`permission_id`
    // valent 0 sur toutes les lignes (cf. gotchas de CLAUDE.md).
    const rows = await this.rolePermissionRepository
      .createQueryBuilder('rp')
      .innerJoin(PermissionEntity, 'p', 'p.uuid = rp.permission_uuid')
      .innerJoin(Role, 'r', 'r.uuid = rp.role_uuid')
      .select([
        'p.id AS id',
        'p.uuid AS uuid',
        'p.name AS name',
        'p.slug AS slug',
        'p.description AS description',
        'p.module_uuid AS module_uuid',
      ])
      .where('rp.role_uuid IN (:...uuids)', { uuids: uniques })
      .andWhere('rp.status = 1')
      .andWhere('r.deleted_at IS NULL')
      .andWhere("COALESCE(r.status, 'enable') <> 'disable'")
      .getRawMany();

    // Un même slug peut remonter via plusieurs rôles : on ne le garde qu'une fois.
    const parSlug = new Map<string, any>();
    for (const row of rows) {
      if (!row?.slug || parSlug.has(row.slug)) continue;
      parSlug.set(row.slug, { ...row, status: true });
    }

    return Array.from(parSlug.values());
  }

  async findAll(
    page = 1,
    limit = 10,
    status?: RoleStatus,
  ): Promise<{ data: RoleListItem[]; meta: Omit<PaginateMeta, 'page'> }> {
    const query = this.roleRepository
      .createQueryBuilder('role')
      .orderBy('role.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    // Sans filtre : tous les rôles, désactivés compris (il faut pouvoir les réactiver).
    if (status) query.andWhere('role.status = :status', { status });

    const [data, total] = await query.getManyAndCount();

    return {
      data: data.map((role) =>
        Object.assign(role, { is_system: this.isSystemRole(role) }),
      ),
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
  }

  async findOneByUuid(uuid: string): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { uuid } });
    if (!role) throw new NotFoundException('Rôle non trouvé');
    return role;
  }

  async findOneBySlug(slug: string): Promise<Role> {
    const role = await this.roleRepository.findOne({ where: { slug } });
    if (!role) throw new NotFoundException('Rôle non trouvé');
    return role;
  }

  async update(uuid: string, updateDto: UpdateRoleDto): Promise<Role> {
    const role = await this.findOneByUuid(uuid);
    this.assertNotSystemRole(role, 'renommé');

    if (updateDto.name === undefined) return role;
    await this.assertNameAvailable(updateDto.name, role.uuid);

    // `update()` ne déclenche pas le hook @BeforeUpdate : on dérive le slug avec la même règle.
    role.name = updateDto.name;
    role.slug = slugify(updateDto.name);
    await this.roleRepository.update(
      { uuid: role.uuid },
      { name: role.name, slug: role.slug },
    );

    return role;
  }

  /** Activation / désactivation réversible. Un rôle désactivé sort des sélecteurs de rôle. */
  async setStatus(uuid: string, status: RoleStatus): Promise<Role> {
    const role = await this.findOneByUuid(uuid);
    this.assertNotSystemRole(role, status === 'disable' ? 'désactivé' : 'réactivé');

    if (role.status !== status) {
      await this.roleRepository.update({ uuid: role.uuid }, { status });
      role.status = status;
    }

    return role;
  }

  async findLevelsByRoleUuid(uuid: string) {
    const role = await this.findOneByUuid(uuid);
    return role;
  }

  async softDelete(uuid: string): Promise<void> {
    const role = await this.findOneByUuid(uuid);
    this.assertNotSystemRole(role, 'supprimé');
    // Critère sur `uuid` : `role.id` est typé number mais vaut une string en base.
    await this.roleRepository.softDelete({ uuid: role.uuid });
  }

  async findAllPermissions(
    roleUuid: string,
  ): Promise<{ modules: ModuleEntity[]; role: Role }> {
    const role = await this.roleRepository.findOne({
      where: { uuid: roleUuid },
    });
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
    const role = await this.roleRepository.findOne({
      where: { uuid: roleUuid },
    });
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
    const rolePerm = await this.rolePermissionRepository.findOne({
      where: { uuid: rolePermissionUuid },
    });
    if (!rolePerm) throw new NotFoundException('Aucun élément trouvé');

    rolePerm.status = !rolePerm.status;
    await this.rolePermissionRepository.save(rolePerm);
  }

  /**
   * Applique le même statut à TOUTES les permissions d'un module pour un rôle donné, en créant
   * au passage les liens `roles_permissions` manquants (sans quoi la case resterait « Aucun
   * élément trouvé » côté écran des rôles).
   * `updated` = liens existants dont le statut a réellement changé ; `created` = liens ajoutés.
   */
  async setModulePermissions(
    roleUuid: string,
    moduleUuid: string,
    status: boolean,
  ): Promise<ModulePermissionsResult> {
    const role = await this.roleRepository.findOne({ where: { uuid: roleUuid } });
    if (!role) throw new NotFoundException('Rôle non trouvé');

    const module = await this.moduleRepository.findOne({
      where: { uuid: moduleUuid },
    });
    if (!module) throw new NotFoundException('Module non trouvé');

    const permissions = await this.permissionRepository.find({
      where: { module_uuid: module.uuid },
    });
    if (permissions.length === 0) {
      return { module_uuid: module.uuid, status, updated: 0, created: 0 };
    }

    // Lien réel = role_uuid + permission_uuid (les colonnes numériques valent 0 partout).
    const links = await this.rolePermissionRepository.find({
      where: {
        role_uuid: role.uuid,
        permission_uuid: In(permissions.map((permission) => permission.uuid)),
      },
    });

    const toUpdate = links.filter((link) => link.status !== status);
    if (toUpdate.length > 0) {
      await this.rolePermissionRepository.update(
        { id: In(toUpdate.map((link) => link.id)) },
        { status },
      );
    }

    const linked = new Set(links.map((link) => link.permission_uuid));
    const missing = permissions.filter(
      (permission) => !linked.has(permission.uuid),
    );
    if (missing.length > 0) {
      await this.rolePermissionRepository.save(
        missing.map((permission) => this.buildLink(role, permission, status)),
      );
    }

    return {
      module_uuid: module.uuid,
      status,
      updated: toUpdate.length,
      created: missing.length,
    };
  }

  /**
   * Crée les liens `roles_permissions` manquants pour un rôle (toutes permissions, statut false).
   * Appelé à la création d'un rôle et par `POST /roles/:uuid/generate-permissions`.
   */
  async generateRolePermissions(roleUuid: string): Promise<void> {
    const role = await this.roleRepository.findOne({
      where: { uuid: roleUuid },
    });
    if (!role) throw new NotFoundException('Rôle non trouvé');

    const permissions = await this.permissionRepository.find();
    if (permissions.length === 0) return;

    // ⚠️ L'existence se teste sur les `*_uuid`, JAMAIS sur `role_id`/`permission_id` : ces deux
    // colonnes valent 0 sur toutes les lignes, et `role.id` vaut en réalité une string uuid -
    // c'est ce qui faisait recréer les liens à chaque appel (ou échouer l'INSERT en mode strict).
    const existing = await this.rolePermissionRepository.find({
      where: { role_uuid: role.uuid },
      select: ['permission_uuid'],
    });
    const linked = new Set(existing.map((link) => link.permission_uuid));

    const missing = permissions.filter(
      (permission) => !linked.has(permission.uuid),
    );
    if (missing.length === 0) return;

    await this.rolePermissionRepository.save(
      missing.map((permission) => this.buildLink(role, permission, false)),
    );
  }

  /** Un lien rôle ↔ permission : uuid généré côté Node, colonnes numériques forcées à 0. */
  private buildLink(
    role: Role,
    permission: PermissionEntity,
    status: boolean,
  ): RolePermissionEntity {
    return this.rolePermissionRepository.create({
      uuid: uuidv4(),
      role_uuid: role.uuid,
      permission_uuid: permission.uuid,
      role_id: 0,
      permission_id: 0,
      status,
    });
  }
}
