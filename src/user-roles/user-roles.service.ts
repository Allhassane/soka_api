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
  ROLE_RESPONSABLE_SLUG,
} from 'src/shared/constants/constants';
import { EffectivePermissionsService } from 'src/access-scope/effective-permissions.service';

@Injectable()
export class UserRoleService {
  private readonly logger = new Logger(UserRoleService.name);

  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepo: Repository<UserRole>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(Role)
    private readonly roleRepo: Repository<Role>,
    // `AccessScopeModule` est @Global : aucune importation de module n'est nécessaire.
    // Sert à faire tomber le cache de droits dès qu'un rôle est attribué ou retiré.
    private readonly effectivePermissions: EffectivePermissionsService,
  ) {}

  /**
   * **Rôles SOCLE : jamais attribués à la main.**
   *
   * MEMBRE et RESPONSABLE sont *calculés* à chaque connexion par `syncBaseRoleForMember` à
   * partir des responsabilités réelles : les poser à la main donnerait une attribution que le
   * prochain login effacerait sans prévenir. ADMINISTRATEUR est exclu pour une autre raison -
   * il ouvre TOUTES les permissions ; le rendre attribuable depuis cet écran en ferait un
   * chemin d'élévation de privilèges discret, alors que le drapeau `is_admin` du compte est
   * le geste explicite prévu pour ça.
   *
   * ⇒ Cet écran sert exactement à ce pour quoi il existe : donner un rôle **métier** (comptable,
   * trésorier…) à des personnes nommées, sans l'accrocher à un palier de la hiérarchie.
   */
  private static readonly SLUGS_SOCLE: string[] = [
    ROLE_ADMIN_SLUG,
    ROLE_MEMBRE_SLUG,
    ROLE_RESPONSABLE_SLUG,
  ];

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
    const role = await this.findRoleOrFail(dto.role_uuid);
    this.assertRoleAttribuable(role);

    await this.ensureUserRoleIsUnique(dto.user_uuid, dto.role_uuid);

    // Une attribution retirée puis redonnée doit RÉUTILISER sa ligne plutôt que d'en empiler
    // une seconde : sans ça, chaque aller-retour laisse un fantôme soft-deleted, et la table
    // n'a aucun index unique pour l'empêcher.
    const retiree = await this.userRoleRepo
      .createQueryBuilder('ur')
      .withDeleted()
      .where('ur.user_uuid = :user_uuid', { user_uuid: dto.user_uuid })
      .andWhere('ur.role_uuid = :role_uuid', { role_uuid: dto.role_uuid })
      .andWhere('ur.deleted_at IS NOT NULL')
      .getOne();

    if (retiree) {
      await this.userRoleRepo.restore({ id: retiree.id });
      await this.userRoleRepo.update({ id: retiree.id }, { is_active: true });
      this.effectivePermissions.invalider(dto.user_uuid);
      return this.userRoleRepo.findOneByOrFail({ id: retiree.id });
    }

    const userRole = this.userRoleRepo.create({
      ...dto,
      user_uuid: dto.user_uuid,
      role_uuid: dto.role_uuid,
      is_active: dto.is_active ?? true,
    });

    const enregistre = await this.userRoleRepo.save(userRole);
    // ⚠️ Sans cette invalidation, le droit met jusqu'à 30 s (TTL du cache) à s'appliquer et
    // l'administrateur croit son geste sans effet.
    this.effectivePermissions.invalider(dto.user_uuid);
    return enregistre;
  }

  /**
   * Refuse l'attribution manuelle d'un rôle socle. Message explicite : l'administrateur doit
   * comprendre POURQUOI, sinon il réessaie ou contourne.
   */
  private assertRoleAttribuable(role: Role): void {
    const slug = (role?.slug ?? '').toLowerCase();
    if (!UserRoleService.SLUGS_SOCLE.includes(slug)) return;

    if (slug === ROLE_ADMIN_SLUG) {
      throw new BadRequestException(
        "Le rôle ADMINISTRATEUR ne s'attribue pas ici : il ouvre toutes les permissions. " +
          'Cochez « administrateur » sur le compte lui-même.',
      );
    }
    throw new BadRequestException(
      `Le rôle ${role.name} est calculé automatiquement à partir des responsabilités du membre : ` +
        "l'attribuer à la main n'aurait aucun effet, la prochaine connexion le recalculerait. " +
        'Créez un rôle dédié pour un besoin métier.',
    );
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

    const enregistre = await this.userRoleRepo.save(userRole);
    this.effectivePermissions.invalider(userRole.user_uuid);
    return enregistre;
  }

  /**
   * Aligne le **rôle socle** d'un compte sur la réalité de ses responsabilités :
   *   - au moins une responsabilité vivante ⇒ **RESPONSABLE**
   *   - aucune                              ⇒ **MEMBRE**
   * Les deux ne coexistent jamais ; les autres rôles (custom, attribués à la main) ne sont pas
   * touchés.
   *
   * **Convergente et idempotente** : elle n'écrit que si l'état diffère, et elle est appelée à
   * **chaque connexion**, avant le calcul des droits.
   *
   * Pourquoi au login plutôt qu'à chaque écriture de responsabilité : `member_responsibilities`
   * est modifiée par `save()`, par `softDelete()` (invisible des subscribers TypeORM) et par le
   * workflow de transfert - tout crochet posé sur l'un de ces chemins en aurait laissé un autre
   * de côté, avec un rôle juste dans un cas et faux dans l'autre. Le login est le seul point
   * par lequel tout compte passe forcément.
   *
   * Conséquence assumée : entre le changement de responsabilité et la connexion suivante, la
   * LIGNE `user_roles` peut être en retard. Sans effet sur les droits réels : les permissions
   * sont calculées à partir des responsabilités elles-mêmes (`AccessScopeService`), pas de
   * cette ligne.
   *
   * ⚠️ Les comptes `is_admin` sont **ignorés** : leur rôle est ADMINISTRATEUR, il ne doit pas
   * être écrasé ni complété par un rôle socle.
   */
  async syncBaseRoleForMember(
    user: { uuid?: string | null; member_uuid?: string | null; is_admin?: boolean | null },
    manager?: EntityManager,
  ): Promise<'RESPONSABLE' | 'MEMBRE' | null> {
    if (!user?.uuid || user.is_admin === true) return null;

    const db = manager ?? this.userRoleRepo.manager;

    try {
      const slugs = await db.query(
        "SELECT `uuid`, `slug` FROM `roles` WHERE `slug` IN (?, ?) AND `deleted_at` IS NULL",
        [ROLE_RESPONSABLE_SLUG, ROLE_MEMBRE_SLUG],
      );
      const parSlug = new Map<string, string>(
        (slugs ?? []).map((r: any) => [r.slug, r.uuid]),
      );
      const uuidResponsable = parSlug.get(ROLE_RESPONSABLE_SLUG);
      const uuidMembre = parSlug.get(ROLE_MEMBRE_SLUG);
      if (!uuidResponsable || !uuidMembre) return null; // base non seedée

      let aResponsabilite = false;
      if (user.member_uuid) {
        const rows = await db.query(
          `SELECT 1
             FROM member_responsibilities mr
             JOIN responsibilities r ON r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL
            WHERE mr.member_uuid = ? AND mr.deleted_at IS NULL
            LIMIT 1`,
          [user.member_uuid],
        );
        aResponsabilite = (rows?.length ?? 0) > 0;
      }

      const cible = aResponsabilite ? uuidResponsable : uuidMembre;
      const aRetirer = aResponsabilite ? uuidMembre : uuidResponsable;

      const dejaLa = await db.query(
        'SELECT `role_uuid` FROM `user_roles` WHERE `user_uuid` = ? AND `role_uuid` IN (?, ?) AND `deleted_at` IS NULL',
        [user.uuid, cible, aRetirer],
      );
      const presents = new Set<string>((dejaLa ?? []).map((r: any) => r.role_uuid));

      if (presents.has(cible) && !presents.has(aRetirer)) return aResponsabilite ? 'RESPONSABLE' : 'MEMBRE';

      // Les deux écritures dans une TRANSACTION pour que le compte ne se retrouve JAMAIS sans
      // rôle socle entre le retrait de l'un et l'ajout de l'autre.
      // ⚠️ Elle ne protège PAS du doublon : la table n'a aucun index unique sur
      // (user_uuid, role_uuid), donc deux connexions simultanées peuvent encore insérer deux
      // fois le rôle cible. Sans conséquence sur les droits (l'union dédoublonne), mais le
      // vrai remède serait un index unique - non posé ici car des doublons historiques
      // pourraient exister et feraient échouer la migration.
      await db.transaction(async (trx) => {
        if (!presents.has(cible)) {
          await trx.query(
            'INSERT INTO `user_roles` (`uuid`, `user_uuid`, `role_uuid`, `is_active`, `created_at`, `updated_at`) ' +
              'VALUES (?, ?, ?, 1, NOW(6), NOW(6))',
            [uuidv4(), user.uuid, cible],
          );
        }
        if (presents.has(aRetirer)) {
          // SOFT delete, pas DELETE : c'est la convention de la table (`deleted_at`), et une
          // suppression physique effaçait sans trace un rôle attribué à la main.
          await trx.query(
            'UPDATE `user_roles` SET `deleted_at` = NOW(6) WHERE `user_uuid` = ? AND `role_uuid` = ? AND `deleted_at` IS NULL',
            [user.uuid, aRetirer],
          );
        }
      });

      return aResponsabilite ? 'RESPONSABLE' : 'MEMBRE';
    } catch (error) {
      // Ne jamais empêcher une connexion ni une écriture de responsabilité pour ça.
      this.logger.warn(
        `Rôle socle non synchronisé pour ${user.uuid} : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return null;
    }
  }

  /**
   * Invariant du projet : **tout utilisateur porte au moins une ligne dans `user_roles`.**
   * Appelée automatiquement à chaque insertion d'utilisateur (cf. `UserDefaultRoleSubscriber`),
   * quelle que soit la voie de création (administration, import, création de membre…).
   *
   * Idempotente : ne fait rien si l'utilisateur a déjà un rôle. Rôle attribué :
   * ADMINISTRATEUR si `is_admin`, MEMBRE sinon - même précédence que `scripts/seed-user-roles.js`.
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
    // Le retrait doit être IMMÉDIAT : c'est un geste de sécurité, il ne peut pas attendre
    // l'expiration d'un cache.
    this.effectivePermissions.invalider(userRole.user_uuid);
  }

  /**
   * **Titulaires d'un rôle** - qui le porte, nommément.
   *
   * C'est la contrepartie indispensable de l'attribution : un rôle sensible (comptable,
   * trésorier) ne se pilote que si la liste de ses porteurs est lisible d'un coup d'œil.
   *
   * Le nom vient de la fiche MEMBRE quand elle existe (`COALESCE`) : le compte peut porter un
   * nom saisi à la main, la fiche membre fait foi.
   */
  async titulaires(roleUuid: string): Promise<any[]> {
    await this.findRoleOrFail(roleUuid);
    return this.userRoleRepo.manager.query(
      `SELECT ur.uuid                              AS user_role_uuid,
              u.uuid                               AS user_uuid,
              COALESCE(m.lastname,  u.lastname)    AS lastname,
              COALESCE(m.firstname, u.firstname)   AS firstname,
              u.phone_number                       AS phone_number,
              u.is_active                          AS compte_actif,
              s.name                               AS structure,
              ur.created_at                        AS attribue_le
         FROM user_roles ur
         JOIN users u      ON u.uuid = ur.user_uuid AND u.deleted_at IS NULL
         LEFT JOIN members m    ON m.uuid = u.member_uuid AND m.deleted_at IS NULL
         LEFT JOIN structures s ON s.uuid = m.structure_uuid AND s.deleted_at IS NULL
        WHERE ur.role_uuid = ? AND ur.deleted_at IS NULL AND ur.is_active = 1
        ORDER BY lastname, firstname`,
      [roleUuid],
    );
  }

  /**
   * **Candidats à l'attribution** : comptes actifs qui ne portent pas déjà ce rôle.
   *
   * ⚠️ Recherche à partir de **2 caractères** et bornée à 20 lignes : sans ces deux limites,
   * une lettre seule ramènerait des milliers de comptes dans une liste déroulante.
   *
   * ⚠️ **Aucun périmètre appliqué, et c'est voulu** : attribuer un rôle est un geste
   * d'administration (droit `collaborateurs_assigner_un_role_a_un_collaborateur`, accordé au
   * seul ADMINISTRATEUR). Le jour où ce droit serait ouvert à un responsable, il faudrait
   * borner cette recherche à son sous-arbre - c'est la condition à ne pas oublier.
   */
  async candidats(roleUuid: string, recherche: string): Promise<any[]> {
    await this.findRoleOrFail(roleUuid);
    const q = (recherche ?? '').trim();
    if (q.length < 2) return [];
    const motif = `%${q}%`;

    return this.userRoleRepo.manager.query(
      `SELECT u.uuid                             AS user_uuid,
              COALESCE(m.lastname,  u.lastname)  AS lastname,
              COALESCE(m.firstname, u.firstname) AS firstname,
              u.phone_number                     AS phone_number,
              s.name                             AS structure
         FROM users u
         LEFT JOIN members m    ON m.uuid = u.member_uuid AND m.deleted_at IS NULL
         LEFT JOIN structures s ON s.uuid = m.structure_uuid AND s.deleted_at IS NULL
        WHERE u.deleted_at IS NULL
          AND u.is_active = 1
          AND (u.firstname LIKE ? OR u.lastname LIKE ? OR u.phone_number LIKE ?
               OR m.firstname LIKE ? OR m.lastname LIKE ?)
          AND NOT EXISTS (
                SELECT 1 FROM user_roles ur
                 WHERE ur.user_uuid = u.uuid AND ur.role_uuid = ? AND ur.deleted_at IS NULL)
        ORDER BY lastname, firstname
        LIMIT 20`,
      [motif, motif, motif, motif, motif, roleUuid],
    );
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
    // ⚠️ `deleted_at IS NULL` explicite : une attribution RETIRÉE ne doit pas interdire de la
    // redonner. Sans ce filtre, retirer puis rendre un rôle échouait sur « déjà assigné ».
    const existing = await this.userRoleRepo
      .createQueryBuilder('ur')
      .innerJoin(Role, 'r', 'r.uuid = ur.role_uuid')
      .where('ur.user_uuid = :user_uuid', { user_uuid })
      .andWhere('ur.role_uuid = :role_uuid', { role_uuid })
      .andWhere('ur.deleted_at IS NULL')
      .getOne();

    if (existing) {
      throw new BadRequestException(
        'Ce rôle est déjà assigné à cet utilisateur',
      );
    }
  }

}
