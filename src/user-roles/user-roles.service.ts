import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from './entities/user-roles.entity';
import { CreateUserRoleDto } from './dtos/create-user-roles.dto';
import { UpdateUserRoleDto } from './dtos/update-user-roles.dto';
import { User } from 'src/users/entities/user.entity';
import { Role } from 'src/roles/entities/role.entity';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import { PaginateMeta } from 'src/shared/interfaces/paginate-meta.interface';
import {
  ROLE_ADMIN_SLUG,
  ROLE_MEMBRE_SLUG,
} from 'src/shared/constants/constants';

@Injectable()
export class UserRoleService {
  private readonly logger = new Logger(UserRoleService.name);

  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>
  ) {}

  /**
   * ⚠️ On assigne les colonnes `user_uuid` / `role_uuid` et **JAMAIS** les relations ORM
   * `user` / `role`. Renseigner la relation ferait écrire à TypeORM les FK numériques
   * `user_id` / `role_id`, or :
   *  - `roles.id` est un CHAR(36) : `role_id` (int) recevrait un uuid ⇒ échec en
   *    `STRICT_TRANS_TABLES` (c'est ce qui faisait planter cette route en 500) ;
   *  - un `role_id` renseigné rendrait vraie la jointure `ur.role_id = rp.role_id` de
   *    `permission.service.ts` alors que `roles_permissions.role_id` vaut 0 partout ⇒ fuite
   *    de toutes les permissions de tous les rôles.
   * Les 7 676 lignes existantes ont `user_id`/`role_id` à NULL : on reste sur cette convention.
   */
  async create(dto: CreateUserRoleDto): Promise<UserRole> {
    await this.findUserOrFail(dto.user_uuid);
    await this.findRoleOrFail(dto.role_uuid);

    await this.ensureUserRoleIsUnique(dto.user_uuid, dto.role_uuid);

    const userRole = this.userRoleRepo.create({
      ...dto,
      user_uuid: dto.user_uuid,
      role_uuid: dto.role_uuid,
      is_active: dto.is_active ?? true,
    });

    return this.userRoleRepo.save(userRole);
  }

  async update(uuid: string, dto: UpdateUserRoleDto): Promise<UserRole> {
    const userRole = await this.findOneByUuid(uuid);

    if (dto.user_uuid) {
      await this.findUserOrFail(dto.user_uuid);
      userRole.user_uuid = dto.user_uuid;
    }

    if (dto.role_uuid) {
      await this.findRoleOrFail(dto.role_uuid);
      // Le couple (utilisateur, rôle) doit rester unique après le changement.
      const userUuid = dto.user_uuid ?? userRole.user_uuid;
      if (dto.role_uuid !== userRole.role_uuid) {
        await this.ensureUserRoleIsUnique(userUuid, dto.role_uuid);
      }
      userRole.role_uuid = dto.role_uuid;
    }

    // `user` / `role` volontairement exclus : cf. commentaire de `create()`.
    const { user_uuid, role_uuid, ...rest } = dto as Record<string, unknown>;
    Object.assign(userRole, rest);

    return this.userRoleRepo.save(userRole);
  }

  /**
   * Invariant du projet : **tout utilisateur porte au moins une ligne dans `user_roles`.**
   * Appelée automatiquement à chaque insertion d'utilisateur (cf. `UserDefaultRoleSubscriber`),
   * quelle que soit la voie de création (administration, import, création de membre…).
   *
   * Idempotente : ne fait rien si l'utilisateur a déjà un rôle. Rôle attribué :
   * ADMINISTRATEUR si `is_admin`, MEMBRE sinon — même précédence que `scripts/seed-user-roles.js`.
   * Silencieuse en cas d'échec : ne jamais faire échouer la création d'un utilisateur (ni
   * l'import de membres) parce que le rôle par défaut n'a pas pu être posé.
   */
  async ensureDefaultRole(
    manager: EntityManager,
    user: { uuid?: string | null; is_admin?: boolean | null },
  ): Promise<void> {
    if (!user?.uuid) return;

    try {
      const existing = await manager.query(
        'SELECT 1 FROM `user_roles` WHERE `user_uuid` = ? LIMIT 1',
        [user.uuid],
      );
      if (existing?.length) return;

      const slug = user.is_admin === true ? ROLE_ADMIN_SLUG : ROLE_MEMBRE_SLUG;
      const roles = await manager.query(
        'SELECT `uuid` FROM `roles` WHERE `slug` = ? AND `deleted_at` IS NULL LIMIT 1',
        [slug],
      );
      const roleUuid = roles?.[0]?.uuid;
      if (!roleUuid) return; // base non seedée : on ne bloque pas la création

      // uuid généré côté Node (jamais de DEFAULT (UUID()) sur ce projet) ;
      // `user_id` / `role_id` laissés à NULL (cf. commentaire de `create()`).
      await manager.query(
        'INSERT INTO `user_roles` (`uuid`, `user_uuid`, `role_uuid`, `is_active`, `created_at`, `updated_at`) ' +
          'VALUES (?, ?, ?, 1, NOW(6), NOW(6))',
        [uuidv4(), user.uuid, roleUuid],
      );
    } catch (error) {
      this.logger.warn(
        `Rôle par défaut non attribué à l'utilisateur ${user.uuid} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async findAll(
    page = 1,
    limit = 10,
  ): Promise<{ data: UserRole[]; meta: Omit<PaginateMeta, 'page'> }> {
    const [data, total] = await this.userRoleRepo
      .createQueryBuilder('user_role')
      .leftJoinAndSelect('user_role.user', 'user')
      .leftJoinAndSelect('user_role.role', 'role')
      .orderBy('user_role.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
  }

  async findOneByUuid(uuid: string): Promise<UserRole> {
    const userRole = await this.userRoleRepo.findOne({
      where: { uuid },
      relations: ['user', 'role'],
    });
    if (!userRole) throw new NotFoundException('Lien user/role non trouvé');
    return userRole;
  }

  async softDelete(uuid: string): Promise<void> {
    const userRole = await this.findOneByUuid(uuid);
    await this.userRoleRepo.softDelete({ id: userRole.id });
  }

  private async findUserOrFail(user_uuid: string): Promise<User> {
    const user = await this.userRepo.findOneBy({ uuid: user_uuid });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user;
  }

  private async findRoleOrFail(role_uuid: string): Promise<Role> {
    const role = await this.roleRepo.findOneBy({ uuid: role_uuid });
    if (!role) throw new NotFoundException('Rôle introuvable');
    return role;
  }

  private async ensureUserRoleIsUnique(
    user_uuid: string,
    role_uuid: string,
  ): Promise<void> {
    const existing = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin(Role, 'r', 'r.uuid = ur.role_uuid')
      .where('ur.user_uuid = :user_uuid', { user_uuid })
      .andWhere('ur.role_uuid = :role_uuid', { role_uuid })
      .getOne();

    if (existing) {
      throw new BadRequestException(
        'Ce rôle est déjà assigné à cet utilisateur',
      );
    }
  }

}
