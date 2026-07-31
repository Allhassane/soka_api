import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/** Un palier accessible : le niveau hiérarchique + la structure du membre à ce niveau. */
export interface ScopeLevel {
  level_uuid: string;
  level_name: string;
  /** 0 = NATIONAL (le plus haut) … 7 = SOUS_GROUPE (le plus bas). */
  level_order: number;
  /** Ancêtre du membre à ce niveau. `null` si le membre est rattaché AU-DESSUS du niveau. */
  structure_uuid: string | null;
  structure_name: string | null;
  /** D'où vient ce palier : responsabilité portée, ou appartenance à un comité. */
  sources: Array<'responsibility' | 'committee'>;
}

/**
 * Droits et périmètre d'un membre, calculés en une fois.
 *
 * Deux notions distinctes, à ne pas confondre :
 *  - **les rôles** (donc les permissions) : union des rôles portés par ses responsabilités,
 *    par ses comités et par `user_roles` ;
 *  - **le périmètre** (donc les données visibles) : le **niveau le plus élevé** atteint par ses
 *    responsabilités OU ses comités, et le sous-arbre de la structure correspondante.
 */
export interface AccessScope {
  member_uuid: string | null;
  is_admin: boolean;

  /** Union dédoublonnée des rôles, toutes provenances confondues. */
  role_uuids: string[];
  sources: {
    responsibility: string[];
    committee: string[];
    user_role: string[];
  };

  /** Paliers accessibles, du plus élevé (order le plus petit) au plus bas. */
  levels: ScopeLevel[];
  /** Palier le plus élevé : la LIMITE de ce que le membre peut voir. */
  max_level: ScopeLevel | null;
  /** Palier le plus bas : ce qui est affiché PAR DÉFAUT (ergonomie). */
  default_level: ScopeLevel | null;

  /** Racine du périmètre : tout son sous-arbre est visible. */
  scope_structure_uuid: string | null;
  /** Structure pré-sélectionnée à l'ouverture des écrans. */
  default_structure_uuid: string | null;
}

interface LigneSource {
  source: 'responsibility' | 'committee';
  role_uuid: string | null;
  level_uuid: string | null;
  level_name: string | null;
  level_order: number | null;
}

interface Ancetre {
  uuid: string;
  name: string;
  level_uuid: string | null;
  level_order: number | null;
  depth: number;
}

@Injectable()
export class AccessScopeService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Calcule d'un bloc les rôles et le périmètre d'un utilisateur.
   * **3 requêtes au total**, quel que soit le nombre de responsabilités ou de comités :
   * les rôles/paliers (1 UNION), la chaîne d'ancêtres de la structure (1 CTE récursive,
   * profondeur ≤ 8), et les rôles de `user_roles` (1).
   */
  async compute(user: {
    uuid: string;
    member_uuid?: string | null;
    is_admin?: boolean | null;
  }): Promise<AccessScope> {
    const memberUuid = user.member_uuid ?? null;

    const [lignes, userRoleUuids] = await Promise.all([
      memberUuid ? this.chargerSources(memberUuid) : Promise.resolve([]),
      this.chargerRolesUtilisateur(user.uuid),
    ]);

    const responsibility = this.rolesDe(lignes, 'responsibility');
    const committee = this.rolesDe(lignes, 'committee');

    const scope: AccessScope = {
      member_uuid: memberUuid,
      is_admin: user.is_admin === true,
      role_uuids: [...new Set([...responsibility, ...committee, ...userRoleUuids])],
      sources: { responsibility, committee, user_role: userRoleUuids },
      levels: [],
      max_level: null,
      default_level: null,
      scope_structure_uuid: null,
      default_structure_uuid: null,
    };

    if (!memberUuid) return scope;

    const structureUuid = await this.structureDuMembre(memberUuid);
    // Par défaut, un membre sans responsabilité ni comité ne voit que sa propre structure.
    scope.scope_structure_uuid = structureUuid;
    scope.default_structure_uuid = structureUuid;

    const paliers = this.paliersDistincts(lignes);
    if (paliers.length === 0 || !structureUuid) return scope;

    const ancetres = await this.chaineAncetres(structureUuid);
    // Ancêtre par `order` de niveau : c'est la règle d'ancre du projet - un responsable n'habite
    // pas la structure qu'il dirige, on remonte donc ses ancêtres jusqu'au niveau visé.
    const parOrdre = new Map<number, Ancetre>();
    for (const a of ancetres) {
      if (a.level_order !== null && !parOrdre.has(a.level_order)) parOrdre.set(a.level_order, a);
    }

    scope.levels = paliers
      .map((p) => {
        const ancetre = parOrdre.get(p.level_order) ?? null;
        return {
          level_uuid: p.level_uuid,
          level_name: p.level_name,
          level_order: p.level_order,
          structure_uuid: ancetre?.uuid ?? null,
          structure_name: ancetre?.name ?? null,
          sources: p.sources,
        };
      })
      .sort((a, b) => a.level_order - b.level_order);

    // Le niveau le plus élevé qui se **résout** en une structure réelle borne le périmètre.
    // (Un membre rattaché AU-DESSUS d'un de ses niveaux n'a pas d'ancêtre à ce niveau :
    // anomalie connue des membres accrochés à un CHAPITRE. On l'ignore plutôt que de tout ouvrir.)
    const resolus = scope.levels.filter((l) => !!l.structure_uuid);
    if (resolus.length > 0) {
      scope.max_level = resolus[0];
      scope.default_level = resolus[resolus.length - 1];
      scope.scope_structure_uuid = resolus[0].structure_uuid;
      scope.default_structure_uuid =
        resolus[resolus.length - 1].structure_uuid ?? structureUuid;
    }

    return scope;
  }

  /**
   * Sous-arbre d'une structure (elle incluse), en UNE requête (CTE récursive descendante).
   *
   * Sert à filtrer une liste sur le périmètre de l'appelant sans dépendre de
   * `StructureTreeService` - lequel vit dans `StructureModule` et n'est pas injectable partout
   * sans créer de cycles. `AccessScopeService` étant `@Global`, n'importe quel service peut
   * borner ses données avec ceci.
   *
   * Profondeur bornée à 16 (la hiérarchie réelle en compte 8) : garde anti-cycle sur des
   * données héritées.
   */
  async sousArbre(structureUuid: string | null | undefined): Promise<Set<string>> {
    if (!structureUuid) return new Set();

    const rows = await this.dataSource.query(
      `WITH RECURSIVE arbre AS (
         SELECT s.uuid, 0 AS profondeur
           FROM structures s
          WHERE s.uuid = ?
          UNION ALL
         SELECT enfant.uuid, arbre.profondeur + 1
           FROM structures enfant
           JOIN arbre ON enfant.parent_uuid = arbre.uuid
          WHERE arbre.profondeur < 16
       )
       SELECT uuid FROM arbre`,
      [structureUuid],
    );

    return new Set<string>((rows ?? []).map((r: any) => r.uuid).filter(Boolean));
  }

  /**
   * Structures dont un utilisateur a le droit de voir les données, ou **`null` s'il n'est pas
   * contraint** (`is_admin`).
   *
   * Raccourci pour les services qui ne connaissent que l'uuid du demandeur et doivent borner
   * une liste : `const autorisees = await …structuresAutorisees(uuid); if (autorisees) filtrer`.
   * Un utilisateur sans structure renvoie un ensemble **vide** - donc « ne voit rien », jamais
   * « voit tout » : le refus est la valeur par défaut.
   */
  async structuresAutorisees(userUuid: string): Promise<Set<string> | null> {
    const rows = await this.dataSource.query(
      'SELECT `uuid`, `member_uuid`, `is_admin` FROM `users` WHERE `uuid` = ? LIMIT 1',
      [userUuid],
    );
    const user = rows?.[0];
    if (!user) return new Set();
    if (user.is_admin === 1 || user.is_admin === true) return null;

    const scope = await this.compute({
      uuid: user.uuid,
      member_uuid: user.member_uuid,
      is_admin: false,
    });

    return this.sousArbre(scope.scope_structure_uuid);
  }

  /** Rôles + paliers portés par les responsabilités et les comités du membre. Une requête. */
  private async chargerSources(memberUuid: string): Promise<LigneSource[]> {
    return this.dataSource.query(
      `SELECT 'responsibility' AS source, r.role_uuid AS role_uuid,
              l.uuid AS level_uuid, l.name AS level_name, l.\`order\` AS level_order
         FROM member_responsibilities mr
         JOIN responsibilities r ON r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL
         LEFT JOIN levels l ON l.uuid = r.level_uuid
        WHERE mr.member_uuid = ? AND mr.deleted_at IS NULL
          AND COALESCE(r.status, 'enable') <> 'disable'
        UNION ALL
       SELECT 'committee' AS source, c.role_uuid AS role_uuid,
              l.uuid AS level_uuid, l.name AS level_name, l.\`order\` AS level_order
         FROM committee_members cm
         JOIN committees c ON c.uuid = cm.committee_uuid AND c.deleted_at IS NULL
         LEFT JOIN levels l ON l.uuid = c.level_uuid
        WHERE cm.member_uuid = ? AND cm.deleted_at IS NULL
          AND COALESCE(c.status, 'enable') <> 'disable'`,
      [memberUuid, memberUuid],
    );
  }

  /** Rôles portés directement par le compte (`user_roles`), tous, pas seulement le premier. */
  private async chargerRolesUtilisateur(userUuid: string): Promise<string[]> {
    const rows = await this.dataSource.query(
      // ⚠️ `ur.deleted_at IS NULL` indispensable : `DELETE /user-roles/:uuid` fait un SOFT delete.
      // Sans ce filtre, un rôle retiré continuait d'accorder ses permissions.
      `SELECT DISTINCT ur.role_uuid AS role_uuid
         FROM user_roles ur
         JOIN roles r ON r.uuid = ur.role_uuid AND r.deleted_at IS NULL
        WHERE ur.user_uuid = ? AND ur.is_active = 1 AND ur.deleted_at IS NULL
          AND COALESCE(r.status, 'enable') <> 'disable'`,
      [userUuid],
    );
    return (rows ?? []).map((r: any) => r.role_uuid).filter(Boolean);
  }

  private async structureDuMembre(memberUuid: string): Promise<string | null> {
    const rows = await this.dataSource.query(
      'SELECT structure_uuid FROM members WHERE uuid = ? AND deleted_at IS NULL LIMIT 1',
      [memberUuid],
    );
    return rows?.[0]?.structure_uuid ?? null;
  }

  /**
   * Chaîne d'ancêtres de la structure du membre, du bas vers le haut, avec l'`order` de chaque
   * niveau. CTE récursive bornée à 16 pour ne jamais boucler sur une donnée héritée cyclique
   * (la hiérarchie réelle compte 8 paliers).
   */
  private async chaineAncetres(structureUuid: string): Promise<Ancetre[]> {
    return this.dataSource.query(
      `WITH RECURSIVE chaine AS (
         SELECT s.uuid, s.name, s.parent_uuid, s.level_uuid, 0 AS depth
           FROM structures s
          WHERE s.uuid = ?
          UNION ALL
         SELECT p.uuid, p.name, p.parent_uuid, p.level_uuid, chaine.depth + 1
           FROM structures p
           JOIN chaine ON p.uuid = chaine.parent_uuid
          WHERE chaine.depth < 16
       )
       SELECT chaine.uuid, chaine.name, chaine.level_uuid, l.\`order\` AS level_order, chaine.depth
         FROM chaine
         LEFT JOIN levels l ON l.uuid = chaine.level_uuid
        ORDER BY chaine.depth ASC`,
      [structureUuid],
    );
  }

  private rolesDe(
    lignes: LigneSource[],
    source: 'responsibility' | 'committee',
  ): string[] {
    return [
      ...new Set(
        lignes
          .filter((l) => l.source === source && !!l.role_uuid)
          .map((l) => l.role_uuid as string),
      ),
    ];
  }

  /** Paliers distincts, avec la ou les provenances qui les justifient. */
  private paliersDistincts(lignes: LigneSource[]): Array<{
    level_uuid: string;
    level_name: string;
    level_order: number;
    sources: Array<'responsibility' | 'committee'>;
  }> {
    const parNiveau = new Map<string, {
      level_uuid: string;
      level_name: string;
      level_order: number;
      sources: Array<'responsibility' | 'committee'>;
    }>();

    for (const l of lignes) {
      if (!l.level_uuid || l.level_order === null) continue;
      const existant = parNiveau.get(l.level_uuid);
      if (existant) {
        if (!existant.sources.includes(l.source)) existant.sources.push(l.source);
      } else {
        parNiveau.set(l.level_uuid, {
          level_uuid: l.level_uuid,
          level_name: l.level_name ?? '',
          level_order: Number(l.level_order),
          sources: [l.source],
        });
      }
    }

    return [...parNiveau.values()];
  }
}
