import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ENFORCED_PERMISSION_SLUGS } from './decorators/require-permissions.decorator';
import { AccessScopeService } from 'src/access-scope/access-scope.service';
import { UserRoleService } from 'src/user-roles/user-roles.service';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
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

    // Calcul unique des rôles ET du périmètre hiérarchique (responsabilités + comités + user_roles).
    private readonly accessScopeService: AccessScopeService,

    // Convergence du rôle socle (MEMBRE / RESPONSABLE) à chaque connexion.
    private readonly userRoleService: UserRoleService,

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

  async login(user: User) {
  // Flux « 1re connexion » : tant que le compte a encore le mot de passe par défaut
  // (must_change_password = true), on NE délivre PAS de session. On génère un nouveau
  // mot de passe, on l'envoie par SMS, et le membre se reconnecte avec.
  if ((user as { must_change_password?: boolean }).must_change_password) {
    return this.handleFirstLogin(user);
  }

  // Trace de connexion : passé ce point, une session est délivrée - le compte a donc
  // servi au moins une fois. La colonne existe depuis l'origine du schéma mais n'était
  // alimentée par personne (0 compte marqué sur 7 886 au 2026-08-02).
  // Écrit UNE seule fois dans la vie du compte : les connexions suivantes ne coûtent
  // aucun UPDATE. On ne date pas la connexion (aucune colonne pour ça, et en ajouter
  // une demanderait une migration) - `sending_at` reste la seule date du parcours.
  if (!user.is_connected) {
    await this.userRepository.update({ id: user.id }, { is_connected: true });
    user.is_connected = true;
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

  // ---- DROITS ET PÉRIMÈTRE : un seul calcul, trois requêtes ----
  // `AccessScopeService` réunit les rôles portés par les responsabilités du membre, par ses
  // comités et par `user_roles`, et calcule au passage les paliers hiérarchiques accessibles.
  // ⚠️ Ne jamais revenir à `roles[0]` : `findUserRoles` n'a aucun `ORDER BY`, le « premier »
  // rôle était indéterminé - c'est précisément pour ça que tout est fusionné.
  // Le rôle socle est aligné AVANT le calcul : un membre qui vient de recevoir (ou de perdre)
  // une responsabilité doit se connecter avec le bon rôle dès cette session.
  await this.userRoleService.syncBaseRoleForMember({
    uuid: user.uuid,
    member_uuid: user.member_uuid,
    is_admin: user.is_admin,
  });

  const scope = await this.accessScopeService.compute({
    uuid: user.uuid,
    member_uuid: user.member_uuid,
    is_admin: user.is_admin,
  });

  let globalPermissions: any[] = [];
  let permissionsSource: string = 'none';

  // `roles` reflète désormais TOUTES les provenances (responsabilités, comités, user_roles),
  // plus la seule table `user_roles`.
  const roles = await this.roleService.findRoleRefsByUuids(scope.role_uuids);

  if (scope.role_uuids.length > 0) {
    globalPermissions =
      await this.roleService.findActivePermissionsForRoleUuids(scope.role_uuids);
  }

  // Repli : un membre sans responsabilité, sans comité et sans rôle utilisateur reste un
  // simple MEMBRE. L'invariant `user_roles` >= 1 rend ce cas rare, mais il protège un compte
  // dont la ligne aurait été supprimée à la main.
  if (globalPermissions.length === 0) {
    try {
      const membreRole = await this.roleService.findOneBySlug(ROLE_MEMBRE_SLUG);
      globalPermissions =
        await this.roleService.findActivePermissionsForRoleUuids([membreRole.uuid]);
      if (globalPermissions.length > 0) permissionsSource = 'default_membre';
    } catch {
      // rôle MEMBRE absent : aucune permission par défaut
    }
  } else {
    permissionsSource =
      [
        scope.sources.responsibility.length > 0 ? 'responsibility_role' : null,
        scope.sources.committee.length > 0 ? 'committee_role' : null,
        scope.sources.user_role.length > 0 ? 'user_role' : null,
      ]
        .filter(Boolean)
        .join('+') || 'none';
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
      // (L'ancien repli « rôle de la responsabilité la plus haute » a disparu : les rôles des
      // responsabilités sont désormais une source de PREMIER rang dans `AccessScopeService`,
      // fusionnée avec les comités et `user_roles` - plus un repli conditionnel.)

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

  // (Le repli MEMBRE est appliqué plus haut, juste après le calcul du périmètre : il n'a pas
  // besoin d'attendre le chargement des informations du membre.)

  // Embarquer les droits dans le JWT (calculés une seule fois ici, pas à chaque requête).
  const isActive = (s: unknown) =>
    s === true || s === 1 || s === '1' || s === 'enable' || s === 'active';
  payload.is_admin = user.is_admin === true;

  // Périmètre embarqué dans le token : les gardes et services le lisent sans requête
  // supplémentaire à chaque appel. 3 champs scalaires, impact négligeable sur la taille.
  payload.scope_structure_uuid = scope.scope_structure_uuid;
  payload.default_structure_uuid = scope.default_structure_uuid;
  payload.max_level_order = scope.max_level?.level_order ?? null;

  // ⚠️ AUCUNE PERMISSION DANS LE TOKEN - à ne pas défaire.
  //
  // Le front re-chiffre le JWT avant de le poser en cookie (`useAuth.login` → `encryptData`,
  // +38 % de volume) et un navigateur **jette silencieusement** tout cookie > 4 096 o : la
  // connexion boucle alors sur la page de login, sans le moindre message. Ce plafond a été
  // atteint deux fois (46 slugs, puis 138) et chaque contournement par filtrage n'a fait que
  // repousser l'échéance. La taille du token ne dépend donc plus du nombre de permissions ni
  // du nombre de routes protégées : `PermissionsGuard` les résout depuis la base
  // (`EffectivePermissionsService`, cache de 30 s par utilisateur).
  //
  // Effet de bord voulu : accorder ou retirer une permission prend effet en moins de 30 s,
  // là où il fallait auparavant se reconnecter.
  //
  // L'interface, elle, lit `user.global_permissions` dans le CORPS de la réponse (non filtré).
  payload.permissions = [];

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
      /**
       * Périmètre hiérarchique : jusqu'où le membre a le droit de voir, et où l'affichage
       * doit s'ouvrir par défaut. `max_level` est la LIMITE (niveau le plus élevé atteint par
       * une responsabilité ou par un comité), `default_level` le palier le plus bas - le front
       * pré-remplit sur celui-ci et laisse remonter librement jusqu'à `max_level`.
       */
      access_scope: {
        levels: scope.levels,
        max_level: scope.max_level,
        default_level: scope.default_level,
        scope_structure_uuid: scope.scope_structure_uuid,
        default_structure_uuid: scope.default_structure_uuid,
      },
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
      {
        password: hashedPassword,
        must_change_password: false,
        // Même trace que « mot de passe oublié » : ce membre a reçu un mot de passe,
        // et c'est cette date qui lui sera opposée s'il en redemande un dans les 24 h.
        // La marquer ici est ce qui rend la fenêtre cohérente entre les deux portes
        // d'entrée : sans ça, une 1re connexion suivie d'une demande immédiate enverrait
        // deux mots de passe (le second annulant le premier) au prix de 4 SMS.
        is_sent: true,
        sending_at: new Date(),
      },
    );

    return {
      must_change_password: true,
      access_token: null,
      user: null,
      message:
        'Un SMS contenant votre mot de passe vous a été envoyé. Reconnectez-vous avec ce mot de passe.',
    };
  }

  // Anti-spam du « mot de passe oublié » : au plus 1 envoi par compte toutes les 24 h.
  // ⚠️ La fenêtre est PERSISTÉE en base (`users.sending_at`), plus en mémoire : sur 24 h,
  // un simple redémarrage de l'API aurait remis tout le monde à zéro - et la fenêtre
  // suivait le NUMÉRO SAISI, alors qu'elle porte désormais sur le COMPTE trouvé.
  // ⚠️ Cette durée est renvoyée au client (`retry_after`) et pilote le compte à rebours de
  // la page « Recevoir mon mot de passe » : elle est la SEULE source de vérité du délai.
  // Ne pas la recopier en dur côté web, les deux divergeraient.
  static readonly RESET_COOLDOWN_SECONDS = 24 * 60 * 60;
  private readonly resetCooldownMs = AuthService.RESET_COOLDOWN_SECONDS * 1000;

  /**
   * « Mot de passe oublié » / 1re connexion (1 étape) : génère un nouveau mot de passe
   * (6 lettres + 3 chiffres), le définit sur le compte et l'envoie en clair par SMS.
   *
   * ⚠️ Les réponses ne sont PLUS génériques (demande produit du 2026-07-31) : un numéro
   * inconnu renvoie **404**, un compte désactivé **403**, une relance trop rapprochée
   * **429** et un échec d'envoi **503**. Avant, ces quatre cas renvoyaient « SMS envoyé »
   * et le membre attendait un SMS qui n'arriverait jamais.
   * **Contrepartie assumée** : l'endpoint est public et permet donc de savoir si un numéro
   * a un compte (énumération). Le cooldown étant *par numéro*, il ne borne pas un balayage
   * de l'espace des numéros - un rate-limit par IP reste à poser (cf. CONTEXT §8).
   */
  async requestPasswordReset(phoneNumber: string) {
    const normalized = (phoneNumber ?? '').replace(/\s+/g, '').trim();
    if (!normalized) {
      throw new BadRequestException('Entrez votre numéro de téléphone.');
    }

    const user = await this.userRepository.findOne({
      where: { phone_number: normalized },
    });
    if (!user) {
      throw new NotFoundException(
        "Ce numéro n'est associé à aucun compte. Vérifiez votre saisie ou contactez un administrateur.",
      );
    }
    if (!user.is_active) {
      throw new ForbiddenException(
        'Ce compte est désactivé. Contactez un administrateur.',
      );
    }

    // Anti-spam : une relance dans les 24 h est refusée EXPLICITEMENT, et le refus
    // RAPPELLE LE JOUR ET L'HEURE de l'envoi précédent - c'est le sens même du blocage :
    // le membre a déjà son mot de passe, on lui dit où le retrouver plutôt que de lui en
    // envoyer un autre (qui annulerait le premier et coûterait 2 SMS de plus).
    // ⚠️ La date vient de la BASE (`sending_at`), pas d'un compteur en mémoire : elle
    // survit à un redémarrage de l'API, sans quoi la fenêtre de 24 h ne tiendrait pas.
    const lastSentAt = user.sending_at ? new Date(user.sending_at) : null;
    const elapsedMs =
      lastSentAt && !Number.isNaN(lastSentAt.getTime())
        ? Date.now() - lastSentAt.getTime()
        : null;
    // `elapsedMs < 0` = date future (horloge décalée, saisie manuelle en base) : on ne
    // bloque pas sur une donnée incohérente, ce serait un verrou sans fin de sortie.
    if (elapsedMs !== null && elapsedMs >= 0 && elapsedMs < this.resetCooldownMs) {
      const remainingSeconds = Math.ceil(
        (this.resetCooldownMs - elapsedMs) / 1000,
      );
      throw new HttpException(
        `Un mot de passe vous a déjà été envoyé par SMS le ${this.formatSentAt(
          lastSentAt as Date,
        )}. Reportez-vous à ce SMS pour vous connecter. Vous pourrez faire une nouvelle demande dans ${this.formatDelay(
          remainingSeconds,
        )}. Si vous ne l'avez pas reçu, contactez un administrateur.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

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
      // Erreur explicite : le mot de passe n'a pas changé, le membre doit réessayer.
      // Pas de cooldown posé ici - aucun SMS n'est parti, l'enfermer 5 min serait absurde.
      throw new ServiceUnavailableException(
        "L'envoi du SMS a échoué. Réessayez dans un instant ou contactez un administrateur.",
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userRepository.update(
      { id: user.id },
      // On lève AUSSI must_change_password : le mot de passe envoyé par SMS est définitif,
      // le membre doit pouvoir se connecter directement avec. Sans ça, un compte encore au
      // défaut (must_change_password = true) verrait login() relancer handleFirstLogin, qui
      // régénère un autre mot de passe et ne délivre aucune session → « le mot de passe reçu
      // par SMS ne marche pas ».
      {
        password: hashedPassword,
        must_change_password: false,
        // Trace de la demande + point de départ de la fenêtre de 24 h, écrits dans le
        // MÊME update que le mot de passe : les deux ne peuvent pas diverger (un membre
        // dont le mot de passe a changé sans date de blocage pourrait en redemander un
        // aussitôt ; l'inverse le bloquerait sur un mot de passe jamais renouvelé).
        // ⚠️ Écrit seulement APRÈS un envoi réussi - voir le 503 plus haut.
        is_sent: true,
        sending_at: new Date(),
      },
    );

    return {
      message: 'Votre mot de passe vient de vous être envoyé par SMS.',
      // Délai avant une nouvelle demande : la page en fait un compte à rebours et
      // désactive son bouton d'envoi pendant ce temps.
      retry_after: AuthService.RESET_COOLDOWN_SECONDS,
    };
  }

  /**
   * « 21 h 18 min », « 58 min », « 45 s » - délai d'attente lisible dans un message
   * d'erreur. Les heures sont indispensables depuis que la fenêtre est passée à 24 h :
   * « 1 278 min » ne se lit pas.
   */
  private formatDelay(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;
    if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
    if (minutes > 0) return rest > 0 ? `${minutes} min ${rest} s` : `${minutes} min`;
    return `${rest} s`;
  }

  /**
   * « dimanche 2 août 2026 à 22:34 » - le repère que le membre doit pouvoir retrouver
   * dans sa messagerie. Fuseau **explicite** (Abidjan) : le serveur est aujourd'hui en
   * UTC+0, donc identique, mais un déplacement d'hébergement ne doit pas décaler l'heure
   * annoncée à un membre qui, lui, ne bouge pas.
   */
  private formatSentAt(date: Date): string {
    return new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Africa/Abidjan',
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  /**
   * Mot de passe généré : **4 chiffres** (ex. 0482), demande produit du 2026-08-02.
   *
   * ⚠️ `randomInt` (crypto) et non `Math.random()` : sur un espace de 10 000 valeurs
   * seulement, un générateur prédictible se devine à partir de quelques tirages observés.
   * ⚠️ Les zéros de tête sont significatifs (`padStart`) : « 0482 » est un mot de passe
   * valide, stocké et comparé comme une CHAÎNE. C'est la raison pour laquelle le champ de
   * saisie ne doit jamais devenir un `<input type="number">` (il mange le zéro de tête,
   * et refuserait au passage les mots de passe alphanumériques encore en base).
   * ⚠️ Tirage uniforme, sans filtre des suites « faibles » (0000, 1234…) : retirer des
   * valeurs réduit l'espace sans gêner un attaquant, qui les essaierait en premier de
   * toute façon.
   */
  private generatePassword(): string {
    return randomInt(0, 10_000).toString().padStart(4, '0');
  }

}
