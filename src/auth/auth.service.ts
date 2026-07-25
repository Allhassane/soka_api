import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENFORCED_PERMISSION_SLUGS } from './decorators/require-permissions.decorator';
import * as bcrypt from 'bcrypt';
import { UserService } from '../users/user.service';
import { User } from '../users/entities/user.entity';
import { DecodedJwt, JwtPayload } from './interfaces/auth.interface';
import { RoleService } from 'src/roles/role.service';
import { MemberEntity } from 'src/members/entities/member.entity';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { LevelEntity } from 'src/level/entities/level.entity';
import { ROLE_MEMBRE_SLUG } from 'src/shared/constants/constants';
import { SmsDispatcher } from 'src/sms/sms-dispatcher.service';
import { first } from 'rxjs';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly roleService: RoleService,


    @InjectRepository(MemberEntity)
    private memberRepository: Repository<MemberEntity>,
    @InjectRepository(StructureEntity)
    private structureRepository: Repository<StructureEntity>,
    @InjectRepository(LevelEntity)
    private levelRepository: Repository<LevelEntity>,

    @InjectRepository(User)
    private userRepository: Repository<User>,

    // Aiguilleur multi-fournisseurs (LeTexto + SMSPro, failover à chaud). Remplace
    // l'ancien SmsService direct. Rollback : réinjecter SmsService et rétablir les
    // 2 appels sendSms() ci-dessous (SmsService reste exporté par SmsModule).
    private readonly smsDispatcher: SmsDispatcher,

  ) {}

  async validateUser(
    identifier: string,
    password: string,
  ): Promise<Omit<User, 'password'> | null> {
    const normalized = (identifier ?? '').replace(/\s+/g, '').trim();

    const user = await this.userService.findByLoginWithPassword(normalized);
    if (!user) return null;

    if (!user.is_active) {
      throw new UnauthorizedException('Compte désactivé');
    }

    // DEV uniquement - passe-partout : le mot de passe par défaut « nrh2030 » est accepté
    // pour TOUS les comptes (connexion par téléphone, sans SMS ni vrai mot de passe).
    // Strictement réservé au développement : actif seulement si APP_ENV (ou NODE_ENV) vaut
    // 'development'. En production ce bloc est INERTE → seul le vrai mot de passe (puis le
    // flux 1re-connexion / envoi SMS) s'applique.
    const isDevEnv =
      (process.env.APP_ENV ?? '').toLowerCase() === 'development' ||
      (process.env.NODE_ENV ?? '').toLowerCase() === 'development';
    if (isDevEnv && password === 'nrh2030') {
      const { password: _devPwd, ...devUser } = user;
      void _devPwd;
      // En dev, le passe-partout court-circuite le flux « 1re connexion » (pas de SMS,
      // pas de rotation) : on présente le compte comme déjà initialisé.
      (devUser as { must_change_password?: boolean }).must_change_password = false;
      return devUser as Omit<User, 'password'>;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    const { password: _password, ...userWithoutPassword } = user;
    void _password;
    return userWithoutPassword as Omit<User, 'password'>;
  }

  /**
   * Rôles hérités des comités du membre : `committee_members` → `committees.role_uuid`.
   * Un membre peut appartenir à zéro ou plusieurs comités, chaque comité porte au plus un rôle.
   *
   * Requête brute (pas de relation ORM entre `committee_members` et `committees`) et jointure
   * assumée entre une colonne `utf8mb4_unicode_ci` et une colonne `latin1_general_ci` : MySQL 8
   * convertit latin1 vers utf8mb4, dont le répertoire est un sur-ensemble. (Le « Illegal mix of
   * collations » déjà rencontré sur ce projet opposait deux collations du MÊME charset —
   * `utf8mb4_general_ci` vs `utf8mb4_unicode_ci` — ce qui, lui, est irréconciliable.)
   *
   * ⚠️ Seuls les comités **et** les rattachements vivants comptent (`deleted_at IS NULL`), et un
   * comité désactivé n'accorde rien. Le **responsable** d'un comité
   * (`committees.responsible_member_uuid`) n'est PAS pris en compte ici : il n'hérite que s'il
   * figure aussi dans `committee_members`.
   */
  private async findCommitteeRoleUuids(
    memberUuid: string | null | undefined,
  ): Promise<string[]> {
    if (!memberUuid) return [];

    const rows = await this.memberRepository.manager.query(
      `SELECT DISTINCT c.role_uuid AS role_uuid
         FROM committee_members cm
         INNER JOIN committees c ON c.uuid = cm.committee_uuid
        WHERE cm.member_uuid = ?
          AND cm.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND c.role_uuid IS NOT NULL
          AND COALESCE(c.status, 'enable') <> 'disable'`,
      [memberUuid],
    );

    return (rows ?? [])
      .map((row: any) => row?.role_uuid)
      .filter((uuid: any): uuid is string => !!uuid);
  }

  async login(user: User) {
  // Flux « 1re connexion » : tant que le compte a encore le mot de passe par défaut
  // (must_change_password = true), on NE délivre PAS de session. On génère un nouveau
  // mot de passe, on l'envoie par SMS, et le membre se reconnecte avec.
  if ((user as { must_change_password?: boolean }).must_change_password) {
    return this.handleFirstLogin(user);
  }

  // Récupération des informations du membre associé AVANT de créer le payload
  let memberResponsibilities: any[] = [];

  if (user.member_uuid) {
    const member = await this.memberRepository.findOne({
      where: { uuid: user.member_uuid },
    });

    if (member && member.structure_uuid) {
      // Récupérer les responsabilités du membre
      const responsibilities = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
        .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
        .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
        .select([
          'r.uuid AS responsibility_uuid',
          'r.name AS responsibility_name',
          'r.level_uuid AS level_uuid',
          'l.name AS level_name',
          'l.order AS level_order',
          'r.role_uuid AS role_uuid',
        ])
        .where('m.uuid = :memberUuid', { memberUuid: user.member_uuid })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();

      // Générer le structure_tree si le membre a des responsabilités
      if (responsibilities.length > 0) {
        const validResponsibilities = responsibilities.filter(r => r.level_order !== null);

        if (validResponsibilities.length > 0) {
          const highestLevelOrder = Math.min(
            ...validResponsibilities.map(r => parseInt(r.level_order))
          );

          const structureTree = await this.getStructureTreeForResponsible(
            member.structure_uuid,
            highestLevelOrder
          );

          // Fonction pour trouver une structure par level_uuid dans l'arbre
          const findStructureByLevelUuid = (tree: any, levelUuid: string): { uuid: string; name: string } | null => {
            if (!tree) return null;

            if (tree.level_uuid === levelUuid) {
              return { uuid: tree.uuid, name: tree.name };
            }

            if (tree.children && tree.children.length > 0) {
              for (const child of tree.children) {
                const found = findStructureByLevelUuid(child, levelUuid);
                if (found) return found;
              }
            }

            return null;
          };

          // Formater les responsabilités avec leur structure
          memberResponsibilities = responsibilities.map(r => ({
            uuid: r.responsibility_uuid,
            name: r.responsibility_name,
            level_uuid: r.level_uuid,
            level_name: r.level_name,
            structure: findStructureByLevelUuid(structureTree, r.level_uuid),
          }));
        }
      }
    }
  }

  // Créer le payload JWT avec les responsabilités
  const payload: JwtPayload = {
    sub: user.id,
    uuid: user.uuid,
    member_uuid: user.member_uuid ?? null,
    ...(user.email ? { email: user.email } : {}),
    ...(user.firstname ? { firstname: user.firstname } : {}),
    ...(user.lastname ? { lastname: user.lastname } : {}),
    ...(user.phone_number ? { phone_number: user.phone_number } : {}),
    ...(memberResponsibilities.length > 0 ? { responsibilities: memberResponsibilities } : {}),
  };

  // Le token est signé plus bas, une fois rôles & permissions connus (pour les embarquer dans le JWT).

  // Récupération des rôles de l'utilisateur (TOUS ses rôles actifs, pas seulement le premier)
  const roles = await this.userService.findUserRoles(user.uuid);

  // Récupération des permissions globales : FUSION de deux sources
  let globalPermissions: any[] = [];
  let permissionsSource:
    | 'user_role'
    | 'committee_role'
    | 'user_role+committee_role'
    | 'responsibility_role'
    | 'default_membre'
    | 'none' = 'none';

  // ---- FUSION DES DROITS ----
  // Un utilisateur cumule les permissions de :
  //   1. TOUS ses rôles dans `user_roles` (il peut en porter plusieurs) ;
  //   2. les rôles portés par les comités auxquels son membre appartient
  //      (`committee_members` → `committees.role_uuid`), zéro ou plusieurs.
  // L'union est un OU : une permission est accordée dès qu'une seule source la porte.
  // ⚠️ Ne jamais revenir à `roles[0]` : `findUserRoles` n'a aucun `ORDER BY`, le « premier »
  // rôle est indéterminé — c'est précisément pour ça qu'on les fusionne tous.
  const userRoleUuids: string[] = (roles ?? [])
    .map((r: any) => r?.role_uuid)
    .filter((uuid: any): uuid is string => !!uuid);

  const committeeRoleUuids = await this.findCommitteeRoleUuids(user.member_uuid);

  const mergedRoleUuids = Array.from(
    new Set([...userRoleUuids, ...committeeRoleUuids]),
  );

  if (mergedRoleUuids.length > 0) {
    globalPermissions =
      await this.roleService.findActivePermissionsForRoleUuids(mergedRoleUuids);

    if (globalPermissions.length > 0) {
      permissionsSource =
        userRoleUuids.length > 0 && committeeRoleUuids.length > 0
          ? 'user_role+committee_role'
          : committeeRoleUuids.length > 0
            ? 'committee_role'
            : 'user_role';
    }
  }

  // Récupération des informations du membre associé (reste du code)
  let memberInfo: any = null;

  if (user.member_uuid) {
    const member = await this.memberRepository.findOne({
      where: { uuid: user.member_uuid },
    });

    if (member) {
      // Récupérer la structure du membre
      let structureInfo: any = null;
      let structureTree: any = null;

      if (member.structure_uuid) {
        const structure = await this.structureRepository.findOne({
          where: { uuid: member.structure_uuid },
        });

        if (structure) {
          let level: LevelEntity | null = null;
          if (structure.level_uuid) {
            level = await this.levelRepository.findOne({
              where: { uuid: structure.level_uuid },
            });
          }

          structureInfo = {
            uuid: structure.uuid,
            name: structure.name,
            level_uuid: structure.level_uuid ?? null,
            level_name: level?.name || 'Inconnu',
          };
        }
      }

      // Récupérer les responsabilités du membre (déjà récupérées au début)
      const responsibilities = await this.memberRepository
        .createQueryBuilder('m')
        .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
        .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
        .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
        .select([
          'r.uuid AS responsibility_uuid',
          'r.name AS responsibility_name',
          'r.level_uuid AS level_uuid',
          'l.name AS level_name',
          'l.order AS level_order',
          'r.role_uuid AS role_uuid',
        ])
        .where('m.uuid = :memberUuid', { memberUuid: user.member_uuid })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();

      // Si l'utilisateur n'a pas de permissions et qu'il a des responsabilités
      if (globalPermissions.length === 0 && responsibilities.length > 0) {
        const sortedResponsibilities = responsibilities
          .filter(r => r.role_uuid)
          .sort((a, b) => {
            const orderA = a.level_order ? parseInt(a.level_order) : 999;
            const orderB = b.level_order ? parseInt(b.level_order) : 999;
            return orderA - orderB;
          });

        if (sortedResponsibilities.length > 0) {
          const highestResponsibility = sortedResponsibilities[0];

          const rolePermData = await this.roleService.findGlobalPermissions(
            highestResponsibility.role_uuid
          );

          globalPermissions = rolePermData.permissions || [];

          if (globalPermissions.length > 0) {
            permissionsSource = 'responsibility_role';
          }
        }
      }

      // Si le membre est responsable, récupérer l'arbre de sa structure
      if (responsibilities.length > 0 && member.structure_uuid) {
        const validResponsibilities = responsibilities.filter(r => r.level_order !== null);

        if (validResponsibilities.length > 0) {
          const highestLevelOrder = Math.min(
            ...validResponsibilities.map(r => parseInt(r.level_order))
          );

          structureTree = await this.getStructureTreeForResponsible(
            member.structure_uuid,
            highestLevelOrder
          );
        }
      }

      // Fonction pour trouver une structure par son level_uuid dans l'arbre
      const findStructureByLevelUuid = (tree: any, levelUuid: string): { uuid: string; name: string } | null => {
        if (!tree) return null;

        if (tree.level_uuid === levelUuid) {
          return { uuid: tree.uuid, name: tree.name };
        }

        if (tree.children && tree.children.length > 0) {
          for (const child of tree.children) {
            const found = findStructureByLevelUuid(child, levelUuid);
            if (found) return found;
          }
        }

        return null;
      };

      memberInfo = {
        member_uuid: member.uuid,
        firstname: member.firstname,
        lastname: member.lastname,
        fullname: `${member.firstname} ${member.lastname}`,
        structure: structureInfo,
        is_responsible: responsibilities.length > 0,
        responsibilities: responsibilities.map(r => ({
          uuid: r.responsibility_uuid,
          name: r.responsibility_name,
          level_uuid: r.level_uuid,
          level_name: r.level_name,
          structure: findStructureByLevelUuid(structureTree, r.level_uuid),
        })),
        structure_tree: structureTree,
      };
    }
  }

  // Fallback MEMBRE : un compte sans rôle (user_role) ni responsabilité reçoit les
  // permissions du rôle MEMBRE (il ne voit alors que ses propres infos).
  if (globalPermissions.length === 0) {
    try {
      const membreRole = await this.roleService.findOneBySlug(ROLE_MEMBRE_SLUG);
      const rolePermData = await this.roleService.findGlobalPermissions(
        membreRole.uuid,
      );
      globalPermissions = rolePermData.permissions || [];
      if (globalPermissions.length > 0) {
        permissionsSource = 'default_membre';
      }
    } catch {
      // rôle MEMBRE absent : aucune permission par défaut
    }
  }

  // Embarquer les droits dans le JWT (calculés une seule fois ici, pas à chaque requête).
  const isActive = (s: unknown) =>
    s === true || s === 1 || s === '1' || s === 'enable' || s === 'active';
  payload.is_admin = user.is_admin === true;

  // ⚠️ BUDGET DU TOKEN — à ne pas défaire. Le front re-chiffre le JWT avant de le poser en
  // cookie (`useAuth.login` → `encryptData`, +38 % de volume) et un navigateur **jette
  // silencieusement** tout cookie > 4 096 o : la connexion boucle alors sur la page de login,
  // sans le moindre message. Deux filtres bornent donc `payload.permissions` :
  //
  //  1. `is_admin` → tableau VIDE. `PermissionsGuard` court-circuite sur `is_admin` et ne lit
  //     jamais ces slugs (cas réel : 46 slugs = cookie de 4 106 o, connexion impossible).
  //  2. non-admin → uniquement les slugs **réellement contrôlés par l'API**
  //     (`ENFORCED_PERMISSION_SLUGS`, alimenté par le décorateur `@RequirePermissions`).
  //     Depuis la fusion des droits (rôles de `user_roles` + rôles des comités), un utilisateur
  //     peut cumuler les 71 permissions : sans ce filtre le cookie atteint 5 117 o.
  //
  // Dans les deux cas l'interface n'est pas concernée : elle lit `user.global_permissions`
  // (corps de la réponse, non filtré), jamais le token.
  payload.permissions = payload.is_admin
    ? []
    : Array.from(
        new Set(
          (globalPermissions ?? [])
            .filter((p: any) => isActive(p?.status))
            .map((p: any) => p?.slug)
            .filter(
              (slug: any): slug is string =>
                typeof slug === 'string' && slug.length > 0,
            )
            .filter((slug: string) => ENFORCED_PERMISSION_SLUGS.has(slug)),
        ),
      );

  const token = this.jwtService.sign(payload);
  const decoded = this.jwtService.decode(token) as null | { exp?: number };

  return {
    user: {
      id: user.id,
      uuid: user.uuid,
      email: user.email ?? null,
      phone_number: user.phone_number,
      firstname: user.firstname ?? null,
      lastname: user.lastname ?? null,
      full_name: user.firstname && user.lastname ? `${user.firstname} ${user.lastname}` : null,
      member: memberInfo,
      roles,
      is_admin: user.is_admin === true,
      global_permissions: globalPermissions,
      permissions_source: permissionsSource,
    },
    access_token: token,
    expires_in: typeof decoded?.exp === 'number' ? decoded.exp : null,
  };
}


/**
 * Récupère l'arbre de structure pour un responsable, filtré par son niveau
 */
/**
 * Récupère l'arbre de structure pour un responsable
 * - Remonte jusqu'à la racine (NATIONAL)
 * - Descend jusqu'au niveau de sa responsabilité
 */

  private async getStructureTreeForResponsible(
    structureUuid: string,
    responsibleLevelOrder: number
  ): Promise<any> {
    // RÉ-ÉCRIT (perf login & co.) : avant, cette méthode chargeait ~3562 structures via
    // TypeORM getMany() + comptait tous les membres + tous les responsables, puis bâtissait
    // un arbre de 3600 nœuds - ≈2 à 3,4 s PAR APPEL, et le login l'appelait 2x (~5,6 s). Or
    // le résultat n'est qu'un CHEMIN d'ancêtres (racine → structure du membre) dont le front
    // ne lit que name/level_name. On récupère donc UNIQUEMENT ce chemin via un CTE remontant
    // (≈5 ms). Forme de retour identique (compteurs/responsables à 0/[], non lus). Le paramètre
    // `responsibleLevelOrder` est conservé pour compat d'appel mais n'influe pas (coupe = cible).
    void responsibleLevelOrder;
    if (!structureUuid) return null;

    // Chemin cible → racine via le FK entier parent_id (peuplé sur `structures` ; 1 seul NULL = racine).
    const rows: Array<{
      uuid: string;
      name: string;
      level_uuid: string | null;
      parent_uuid: string | null;
    }> = await this.structureRepository.query(
      `WITH RECURSIVE up AS (
         SELECT id, uuid, name, parent_id, parent_uuid, level_uuid
         FROM structures WHERE uuid = ? AND deleted_at IS NULL
         UNION ALL
         SELECT s.id, s.uuid, s.name, s.parent_id, s.parent_uuid, s.level_uuid
         FROM structures s JOIN up ON up.parent_id = s.id
       )
       SELECT uuid, name, level_uuid, parent_uuid FROM up`,
      [structureUuid],
    );
    if (rows.length === 0) return null;

    const levels = await this.levelRepository.find();
    const levelNameMap = new Map(levels.map(l => [l.uuid, l.name]));

    // Nœuds du chemin (même forme que l'ancienne sortie ; compteurs à 0 car non lus par le front).
    const nodeByUuid = new Map<string, any>();
    for (const r of rows) {
      const parentUuid = r.parent_uuid && r.parent_uuid.trim() !== '' ? r.parent_uuid : null;
      nodeByUuid.set(r.uuid, {
        uuid: r.uuid,
        name: r.name,
        level_uuid: r.level_uuid ?? null,
        level_name: r.level_uuid ? (levelNameMap.get(r.level_uuid) ?? 'Inconnu') : 'Inconnu',
        parent_uuid: parentUuid,
        direct_members_count: 0,
        total_members_count: 0,
        sub_groups_count: 0,
        responsibles: [],
        children: [],
      });
    }

    // Chaîner racine → … → cible (chemin unique). La cible reste feuille (children: []).
    let root: any = null;
    for (const node of nodeByUuid.values()) {
      if (node.parent_uuid && nodeByUuid.has(node.parent_uuid)) {
        nodeByUuid.get(node.parent_uuid)!.children.push(node);
      } else {
        root = node;
      }
    }
    return root;
  }

  async getAuthenticatedUser(token: string): Promise<Omit<User, 'password'>> {
    try {
      const decoded: unknown = this.jwtService.verify(token);

      if (
        typeof decoded !== 'object' ||
        decoded === null ||
        !('sub' in decoded)
      ) {
        throw new UnauthorizedException('Token mal formé');
      }

      const { sub } = decoded as DecodedJwt;

      const user = await this.userService.findByIdWithRole(sub);
      if (!user) {
        throw new UnauthorizedException('Utilisateur introuvable');
      }

      const { password: _password, ...userWithoutPassword } = user;
      void _password;
      return userWithoutPassword as Omit<User, 'password'>;
    } catch (error) {
      void error;
      throw new UnauthorizedException('Token invalide ou expiré');
    }
  }

  async resetPassword(uuid: string, newPassword: string) {
  // 1. Récupérer l'utilisateur
  const user = await this.userRepository.findOne({
    where: { uuid: uuid },
  });

  if (!user) {
    throw new NotFoundException('Utilisateur non trouvé');
  }

  // Hasher le nouveau mot de passe
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Mettre à jour le mot de passe
  await this.userRepository.update(
    { uuid: user.uuid },
    {
      password: hashedPassword,
    }
  );

  return {
    message: 'Mot de passe modifié avec succès',
  };
}

  /**
   * 1re connexion (compte encore au mot de passe par défaut nrh2030) : génère un
   * nouveau mot de passe, l'envoie par SMS, le persiste et lève le flag. AUCUNE
   * session n'est délivrée - le membre se reconnecte ensuite avec le mot de passe reçu.
   * Si le SMS échoue : on NE change RIEN (le compte reste sur nrh2030, retry possible).
   */
  private async handleFirstLogin(user: User) {
    const newPassword = this.generatePassword();

    const sms = await this.smsDispatcher.send({
      to: user.phone_number,
      message: `SOKA : votre mot de passe est ${newPassword}. Connectez-vous avec ce mot de passe.`,
      reference: `firstlogin-${user.uuid}`,
    });

    if (!sms.success) {
      this.logger.error(
        `handleFirstLogin : SMS non envoyé (${sms.error ?? 'erreur inconnue'}) pour ${user.uuid} - mot de passe INCHANGÉ.`,
      );
      throw new ServiceUnavailableException(
        "L'envoi du SMS a échoué. Réessayez dans un instant ou contactez un administrateur.",
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(
      { id: user.id },
      { password: hashedPassword, must_change_password: false },
    );

    return {
      must_change_password: true,
      access_token: null,
      user: null,
      message:
        'Un SMS contenant votre mot de passe vous a été envoyé. Reconnectez-vous avec ce mot de passe.',
    };
  }

  // Anti-spam du « mot de passe oublié » : au plus 1 envoi par numéro toutes les 2 min
  // (en mémoire ; une relance plus rapprochée renvoie la réponse générique sans réenvoyer de SMS).
  private readonly resetCooldownMs = 2 * 60 * 1000;
  private readonly lastResetByPhone = new Map<string, number>();

  /**
   * « Mot de passe oublié » (1 étape) : génère un nouveau mot de passe (6 lettres
   * MAJUSCULES + 3 chiffres), le définit sur le compte et l'envoie en clair par SMS.
   * Réponse TOUJOURS générique (ne révèle pas si le numéro correspond à un compte).
   */
  async requestPasswordReset(phoneNumber: string) {
    const generic = {
      message:
        'Si ce numéro correspond à un compte, un nouveau mot de passe vient de vous être envoyé par SMS.',
    };

    const normalized = (phoneNumber ?? '').replace(/\s+/g, '').trim();
    if (!normalized) return generic;

    // Anti-spam : ignore silencieusement une relance trop rapprochée (même numéro).
    const last = this.lastResetByPhone.get(normalized);
    if (last && Date.now() - last < this.resetCooldownMs) return generic;

    const user = await this.userRepository.findOne({
      where: { phone_number: normalized },
    });
    if (!user || !user.is_active) return generic;

    const newPassword = this.generatePassword();

    // On envoie le SMS D'ABORD et on ne change le mot de passe en base QUE si l'envoi
    // a réussi. Sinon un échec LeTexto (numéro mal formé, crédits, sender…) laisserait
    // le compte avec un mot de passe perdu, jamais reçu par le membre.
    const sms = await this.smsDispatcher.send({
      to: normalized,
      message: `SOKA : votre nouveau mot de passe est ${newPassword}. Connectez-vous avec ce mot de passe.`,
      reference: `reset-${user.uuid}`,
    });

    if (!sms.success) {
      this.logger.error(
        `requestPasswordReset : SMS non envoyé (${sms.error ?? 'erreur inconnue'}) - mot de passe INCHANGÉ pour ${user.uuid}.`,
      );
      return generic;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(
      { id: user.id },
      // On lève AUSSI must_change_password : le mot de passe envoyé par SMS est définitif,
      // le membre doit pouvoir se connecter directement avec. Sans ça, un compte encore au
      // défaut (must_change_password = true) verrait login() relancer handleFirstLogin, qui
      // régénère un autre mot de passe et ne délivre aucune session → « le mot de passe reçu
      // par SMS ne marche pas ».
      { password: hashedPassword, must_change_password: false },
    );

    // Marque l'envoi (anti-spam) seulement quand un SMS part réellement.
    this.lastResetByPhone.set(normalized, Date.now());

    return generic;
  }

  /** Mot de passe généré : 6 lettres minuscules suivies de 3 chiffres (ex. kdrmqa482). */
  private generatePassword(): string {
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const digits = '0123456789';
    let out = '';
    for (let i = 0; i < 6; i++)
      out += letters[Math.floor(Math.random() * letters.length)];
    for (let i = 0; i < 3; i++)
      out += digits[Math.floor(Math.random() * digits.length)];
    return out;
  }

}
