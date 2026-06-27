import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import { SmsService } from 'src/sms/sms.service';
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

    private readonly smsService: SmsService,

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

  // Récupération des rôles de l'utilisateur
  const roles = await this.userService.findUserRoles(user.uuid);

  // Récupération des permissions globales liées au rôle de l'utilisateur
  let globalPermissions: any[] = [];
  let permissionsSource:
    | 'user_role'
    | 'responsibility_role'
    | 'default_membre'
    | 'none' = 'none';

  if (roles && roles.length > 0) {
    const firstRole = roles[0];
    const rolePermData = await this.roleService.findGlobalPermissions(firstRole.role_uuid);
    globalPermissions = rolePermData.permissions || [];
    if (globalPermissions.length > 0) {
      permissionsSource = 'user_role';
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
  payload.permissions = Array.from(
    new Set(
      (globalPermissions ?? [])
        .filter((p: any) => isActive(p?.status))
        .map((p: any) => p?.slug)
        .filter((slug: any): slug is string => typeof slug === 'string' && slug.length > 0),
    ),
  );
  payload.is_admin = user.is_admin === true;

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
    // Récupérer toutes les structures
    const structures = await this.structureRepository
      .createQueryBuilder('s')
      .where('s.deleted_at IS NULL')
      .getMany();

    if (structures.length === 0) return null;

    // Récupérer tous les niveaux
    const levels = await this.levelRepository.find();
    const levelsMap = new Map(levels.map(l => [l.uuid, { name: l.name, order: l.order }]));

    // Compter les membres directs par structure
    const memberCounts = await this.memberRepository
      .createQueryBuilder('m')
      .select('m.structure_uuid', 'structure_uuid')
      .addSelect('COUNT(*)', 'count')
      .where('m.deleted_at IS NULL')
      .groupBy('m.structure_uuid')
      .getRawMany();

    const memberCountMap = new Map(
      memberCounts.map(mc => [mc.structure_uuid, parseInt(mc.count)])
    );

    // Récupérer les responsables par structure
    const responsibles = await this.memberRepository
      .createQueryBuilder('m')
      .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
      .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
      .select([
        'm.structure_uuid AS structure_uuid',
        'm.uuid AS member_uuid',
        "CONCAT(m.firstname, ' ', m.lastname) AS member_name",
        'r.uuid AS responsibility_uuid',
        'r.name AS responsibility_name',
      ])
      .where('m.deleted_at IS NULL')
      .getRawMany();

    // Grouper les responsables par structure
    const responsiblesMap = new Map<string, any[]>();
    for (const resp of responsibles) {
      if (!resp.structure_uuid) continue;
      if (!responsiblesMap.has(resp.structure_uuid)) {
        responsiblesMap.set(resp.structure_uuid, []);
      }
      responsiblesMap.get(resp.structure_uuid)!.push({
        member_uuid: resp.member_uuid,
        member_name: resp.member_name,
        responsibility_uuid: resp.responsibility_uuid,
        responsibility_name: resp.responsibility_name,
      });
    }

    // Construire la map des structures
    const structureMap = new Map<string, any>();

    for (const structure of structures) {
      const levelUuid = structure.level_uuid ?? null;
      const levelInfo = levelUuid ? levelsMap.get(levelUuid) : null;
      const parentUuid = structure.parent_uuid && structure.parent_uuid.trim() !== ''
        ? structure.parent_uuid
        : null;

      structureMap.set(structure.uuid, {
        uuid: structure.uuid,
        name: structure.name,
        level_uuid: levelUuid,
        level_name: levelInfo?.name || 'Inconnu',
        level_order: levelInfo?.order ?? 999,
        parent_uuid: parentUuid,
        direct_members_count: memberCountMap.get(structure.uuid) ?? 0,
        total_members_count: 0,
        sub_groups_count: 0,
        responsibles: responsiblesMap.get(structure.uuid) ?? [],
        children: [],
      });
    }

    // Construire l'arbre complet
    const rootNodes: any[] = [];

    for (const node of structureMap.values()) {
      if (node.parent_uuid && structureMap.has(node.parent_uuid)) {
        const parent = structureMap.get(node.parent_uuid)!;
        parent.children.push(node);
      } else {
        rootNodes.push(node);
      }
    }

    // Calculer les totaux
    const calculateTotals = (node: any): number => {
      let total = node.direct_members_count;
      let subGroupsCount = 0;

      for (const child of node.children) {
        total += calculateTotals(child);
        subGroupsCount += 1 + child.sub_groups_count;
      }

      node.total_members_count = total;
      node.sub_groups_count = subGroupsCount;

      return total;
    };

    for (const root of rootNodes) {
      calculateTotals(root);
    }

    // Trouver la structure du responsable
    const targetStructure = structureMap.get(structureUuid);
    if (!targetStructure) return null;

    // Remonter jusqu'à la racine pour construire le chemin
    const pathToRoot: string[] = [];
    let currentUuid = structureUuid;

    while (currentUuid) {
      pathToRoot.push(currentUuid);
      const current = structureMap.get(currentUuid);
      currentUuid = current?.parent_uuid;
    }

    // Trouver la racine
    const rootUuid = pathToRoot[pathToRoot.length - 1];
    const rootStructure = structureMap.get(rootUuid);
    if (!rootStructure) return null;

    // Filtrer l'arbre : garder le chemin vers la structure cible et couper au niveau de responsabilité
    const filterTree = (node: any, pathUuids: string[], targetLevelOrder: number): any => {
      const { level_order, ...nodeWithoutOrder } = node;
      const isOnPath = pathUuids.includes(node.uuid);
      const isTarget = node.uuid === structureUuid;

      // Si c'est la structure cible, couper les enfants (s'arrêter à son niveau)
      if (isTarget) {
        return {
          ...nodeWithoutOrder,
          children: [],
        };
      }

      // Si on est sur le chemin vers la cible, garder seulement l'enfant qui mène à la cible
      if (isOnPath) {
        const filteredChildren = node.children
          .filter((child: any) => pathUuids.includes(child.uuid))
          .map((child: any) => filterTree(child, pathUuids, targetLevelOrder));

        return {
          ...nodeWithoutOrder,
          children: filteredChildren,
        };
      }

      // Sinon, ne pas inclure ce nœud
      return null;
    };

    return filterTree(rootStructure, pathToRoot, responsibleLevelOrder);
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

    const sms = await this.smsService.sendSms(
      user.phone_number,
      `SOKA : votre mot de passe est ${newPassword}. Connectez-vous avec ce mot de passe.`,
      `firstlogin-${user.uuid}`,
    );

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
    const sms = await this.smsService.sendSms(
      normalized,
      `SOKA : votre nouveau mot de passe est ${newPassword}. Connectez-vous avec ce mot de passe.`,
      `reset-${user.uuid}`,
    );

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
