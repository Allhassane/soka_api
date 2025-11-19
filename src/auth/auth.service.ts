import { Injectable, UnauthorizedException } from '@nestjs/common';
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

@Injectable()
export class AuthService {
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

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    const { password: _password, ...userWithoutPassword } = user;
    void _password;
    return userWithoutPassword as Omit<User, 'password'>;
  }

/*
    async login_old(user: User) {
  const payload: JwtPayload = {
    sub: user.id,
    uuid: user.uuid,
    ...(user.email ? { email: user.email } : {}),
    ...(user.phone_number ? { phone_number: user.phone_number } : {}),
  };

  const token = this.jwtService.sign(payload);
  const decoded = this.jwtService.decode(token) as null | { exp?: number };

  // Récupération des rôles de l'utilisateur
  const roles = await this.userService.findUserRoles(user.uuid);

  // Récupération des permissions globales liées au rôle
  let globalPermissions: any[] = [];
  if (roles && roles.length > 0) {
    const firstRole = roles[0]; // Si multi-rôles, on prend le 1er
    const rolePermData =
      await this.roleService.findGlobalPermissions(firstRole.role_uuid);

    globalPermissions = rolePermData.permissions || [];
  }

  return {
    user: {
      id: user.id,
      uuid: user.uuid,
      email: user.email ?? null,
      phone_number: user.phone_number,
      roles,
      global_permissions: globalPermissions, // Permissions depuis le rôle (allPermissions)
    },
    access_token: token,
    expires_in: typeof decoded?.exp === 'number' ? decoded.exp : null,
  };
}
*/



  async login(user: User) {
  const payload: JwtPayload = {
    sub: user.id,
    uuid: user.uuid,
    ...(user.email ? { email: user.email } : {}),
    ...(user.phone_number ? { phone_number: user.phone_number } : {}),
  };

  const token = this.jwtService.sign(payload);
  const decoded = this.jwtService.decode(token) as null | { exp?: number };

  // Récupération des rôles de l'utilisateur
  const roles = await this.userService.findUserRoles(user.uuid);

  // Récupération des permissions globales liées au rôle de l'utilisateur
  let globalPermissions: any[] = [];
  let permissionsSource: 'user_role' | 'responsibility_role' | 'none' = 'none';

  if (roles && roles.length > 0) {
    const firstRole = roles[0];
    const rolePermData = await this.roleService.findGlobalPermissions(firstRole.role_uuid);
    globalPermissions = rolePermData.permissions || [];
    if (globalPermissions.length > 0) {
      permissionsSource = 'user_role';
    }
  }

  // Récupération des informations du membre associé
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

      // Récupérer les responsabilités du membre avec le rôle associé
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
          'r.role_uuid AS role_uuid',  // <-- Important !
        ])
        .where('m.uuid = :memberUuid', { memberUuid: user.member_uuid })
        .andWhere('m.deleted_at IS NULL')
        .getRawMany();

      // Si l'utilisateur n'a pas de permissions et qu'il a des responsabilités,
      // utiliser les permissions du rôle lié à sa responsabilité
      if (globalPermissions.length === 0 && responsibilities.length > 0) {
        // Trouver la responsabilité avec le niveau le plus haut (order le plus petit)
        const sortedResponsibilities = responsibilities
          .filter(r => r.role_uuid) // Filtrer seulement celles qui ont un role_uuid
          .sort((a, b) => {
            const orderA = a.level_order ? parseInt(a.level_order) : 999;
            const orderB = b.level_order ? parseInt(b.level_order) : 999;
            return orderA - orderB;
          });

        if (sortedResponsibilities.length > 0) {
          const highestResponsibility = sortedResponsibilities[0];

          console.log('=== Debug Permissions ===');
          console.log('Highest responsibility:', highestResponsibility);
          console.log('Role UUID:', highestResponsibility.role_uuid);

          const rolePermData = await this.roleService.findGlobalPermissions(
            highestResponsibility.role_uuid
          );

          console.log('Role permissions data:', rolePermData);

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
        })),
        structure_tree: structureTree,
      };
    }
  }

  return {
    user: {
      id: user.id,
      uuid: user.uuid,
      email: user.email ?? null,
      phone_number: user.phone_number,
      member: memberInfo,
      roles,
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
}
