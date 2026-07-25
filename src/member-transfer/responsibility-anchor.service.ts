import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LevelEntity } from 'src/level/entities/level.entity';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';

/** Nom du niveau pivot du workflow de transfert (comparé en majuscules). */
export const DISTRICT_LEVEL_NAME = 'DISTRICT';

/** Niveaux acceptés comme structure d'accueil finale d'un membre (comparés en majuscules). */
export const LEAF_LEVEL_NAMES = ['GROUPE', 'SOUS_GROUPE'];

export interface StructureNode {
  uuid: string;
  parent_uuid: string | null;
  level_uuid: string | null;
}

/** Index en mémoire de l'arbre des structures : uuid → nœud. */
export type StructureIndex = Map<string, StructureNode>;

export interface ResponsibilityImpact {
  /** Ligne `member_responsibilities` à soft-deleter si la responsabilité est perdue. */
  member_responsibility_uuid: string;
  responsibility_uuid: string;
  responsibility_name: string;
  level_uuid: string | null;
  level_name: string | null;
  /** Structure d'ancrage avant le transfert (null si indéterminable). */
  anchor_before: string | null;
  /** Structure d'ancrage après le transfert. */
  anchor_after: string | null;
  kept: boolean;
  /**
   * `true` quand l'ancre n'a pas pu être déterminée (responsabilité sans niveau, ou niveau
   * absent du chemin hiérarchique). Dans ce cas la responsabilité est **conservée par
   * défaut** — on ne supprime jamais ce qu'on ne sait pas interpréter.
   */
  undetermined: boolean;
}

export interface MemberImpact {
  member_uuid: string;
  from_structure_uuid: string;
  to_structure_uuid: string;
  kept: ResponsibilityImpact[];
  lost: ResponsibilityImpact[];
}

export interface MemberMove {
  member_uuid: string;
  from_structure_uuid: string;
  to_structure_uuid: string;
}

/**
 * Remonte la chaîne des parents depuis `structureUuid` (inclus) et retourne l'uuid de la
 * première structure dont le niveau est `levelUuid`. `null` si aucune ne correspond.
 *
 * Reproduit volontairement `findStructureByLevelUuid` (`auth.service.ts`) : c'est ce calcul
 * qui fait autorité sur « où vit » une responsabilité.
 *
 * Fonction **pure** (aucun accès base) : c'est elle qui porte la règle R8, et c'est elle que
 * les tests couvrent.
 */
export function ancestorAtLevel(
  index: StructureIndex,
  structureUuid: string | null | undefined,
  levelUuid: string | null | undefined,
): string | null {
  if (!structureUuid || !levelUuid) return null;

  let current: string | null = structureUuid;
  const seen = new Set<string>(); // garde anti-cycle (données héritées)

  while (current && !seen.has(current)) {
    seen.add(current);
    const node = index.get(current);
    if (!node) return null;
    if (node.level_uuid === levelUuid) return node.uuid;
    current =
      node.parent_uuid && node.parent_uuid.trim() !== '' ? node.parent_uuid : null;
  }

  return null;
}

/**
 * **Règle R8 — ancre de responsabilité.**
 *
 * Une responsabilité de niveau `levelUuid` est conservée **si et seulement si** son ancre est
 * inchangée après le déplacement :
 *
 * ```
 * ancêtre(structure_nouvelle, L) === ancêtre(structure_ancienne, L)
 * ```
 *
 * Exemples : un responsable national qui déménage garde sa responsabilité (l'ancre reste la
 * racine) ; un responsable de centre qui change de chapitre à l'intérieur du même centre la
 * garde ; s'il change de centre régional — donc de centre — il la perd.
 *
 * Fonction **pure**.
 */
export function evaluateAnchor(
  index: StructureIndex,
  fromStructureUuid: string,
  toStructureUuid: string,
  levelUuid: string | null | undefined,
): Pick<
  ResponsibilityImpact,
  'anchor_before' | 'anchor_after' | 'kept' | 'undetermined'
> {
  const anchor_before = ancestorAtLevel(index, fromStructureUuid, levelUuid);
  const anchor_after = ancestorAtLevel(index, toStructureUuid, levelUuid);
  const undetermined = anchor_before === null;

  return {
    anchor_before,
    anchor_after,
    // undetermined ⇒ conservée : on ne supprime pas une responsabilité qu'on ne sait pas situer.
    kept: undetermined ? true : anchor_before === anchor_after,
    undetermined,
  };
}

/**
 * Calcule l'effet d'un changement de structure sur les responsabilités d'un membre.
 *
 * ⚠️ Ce service doit être appelé par **tous** les chemins qui modifient
 * `members.structure_uuid` — le workflow de transfert comme le `PUT /members/:uuid` — sinon
 * deux comportements divergents cohabiteraient selon le chemin emprunté.
 *
 * Spécification : `docs/TRANSFERT-MEMBRES.md` §5.
 */
@Injectable()
export class ResponsibilityAnchorService {
  constructor(
    @InjectRepository(StructureEntity)
    private readonly structureRepository: Repository<StructureEntity>,
    @InjectRepository(LevelEntity)
    private readonly levelRepository: Repository<LevelEntity>,
    @InjectRepository(MemberResponsibilityEntity)
    private readonly memberResponsibilityRepository: Repository<MemberResponsibilityEntity>,
  ) {}

  /**
   * Charge tout l'arbre des structures en **une seule requête**, puis travaille en mémoire.
   *
   * ⚠️ Ne jamais remonter la hiérarchie par requêtes successives : l'approche récursive a déjà
   * coûté des milliers de requêtes et un timeout passerelle sur un palier haut
   * (cf. `getAllSubStructureUuids`, `structure-tree.service.ts`).
   */
  async loadStructureIndex(): Promise<StructureIndex> {
    const rows = await this.structureRepository.find({
      select: ['uuid', 'parent_uuid', 'level_uuid'],
    });

    const index: StructureIndex = new Map();
    for (const row of rows) {
      index.set(row.uuid, {
        uuid: row.uuid,
        parent_uuid: row.parent_uuid ?? null,
        level_uuid: row.level_uuid ?? null,
      });
    }
    return index;
  }

  /**
   * UUID du niveau portant `levelName`, restreint aux niveaux **réellement utilisés par les
   * structures**.
   *
   * La table `levels` mélange deux catégories (`level` / `responsibility`) et peut donc
   * contenir deux lignes homonymes. On ne garde que celle qui apparaît dans l'arbre — la seule
   * avec laquelle une comparaison d'ancre a du sens.
   */
  async resolveLevelUuidByName(
    levelName: string,
    index?: StructureIndex,
  ): Promise<string | null> {
    const structureIndex = index ?? (await this.loadStructureIndex());
    const usedLevelUuids = new Set<string>();
    for (const node of structureIndex.values()) {
      if (node.level_uuid) usedLevelUuids.add(node.level_uuid);
    }

    const levels = await this.levelRepository.find({ select: ['uuid', 'name'] });
    const wanted = levelName.toUpperCase();

    const match = levels.find(
      (l) => l.name?.toUpperCase() === wanted && usedLevelUuids.has(l.uuid),
    );

    return match?.uuid ?? null;
  }

  /** District auquel appartient une structure (elle-même si c'est déjà un district). */
  async resolveDistrict(
    structureUuid: string,
    index?: StructureIndex,
  ): Promise<string | null> {
    const structureIndex = index ?? (await this.loadStructureIndex());
    const districtLevelUuid = await this.resolveLevelUuidByName(
      DISTRICT_LEVEL_NAME,
      structureIndex,
    );
    if (!districtLevelUuid) return null;

    return ancestorAtLevel(structureIndex, structureUuid, districtLevelUuid);
  }

  /**
   * Responsabilités actives d'un ensemble de membres, avec leur niveau.
   *
   * ⚠️ Jointures sur `member_uuid` / `responsibility_uuid` : les colonnes `member_id` et
   * `responsibility_id` sont NULL sur toutes les lignes migrées.
   */
  private async loadResponsibilities(memberUuids: string[]) {
    if (memberUuids.length === 0) return [];

    return this.memberResponsibilityRepository
      .createQueryBuilder('mr')
      .innerJoin(
        'responsibilities',
        'r',
        'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL',
      )
      .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
      .select([
        'mr.uuid AS member_responsibility_uuid',
        'mr.member_uuid AS member_uuid',
        'r.uuid AS responsibility_uuid',
        'r.name AS responsibility_name',
        'r.level_uuid AS level_uuid',
        'l.name AS level_name',
      ])
      .where('mr.member_uuid IN (:...memberUuids)', { memberUuids })
      .andWhere('mr.deleted_at IS NULL')
      .getRawMany();
  }

  /**
   * Impact d'un lot de déplacements. Une seule lecture de l'arbre et une seule lecture des
   * responsabilités, quel que soit le nombre de membres.
   */
  async computeImpact(
    moves: MemberMove[],
    index?: StructureIndex,
  ): Promise<MemberImpact[]> {
    if (moves.length === 0) return [];

    const structureIndex = index ?? (await this.loadStructureIndex());
    const rows = await this.loadResponsibilities(moves.map((m) => m.member_uuid));

    const byMember = new Map<string, typeof rows>();
    for (const row of rows) {
      const bucket = byMember.get(row.member_uuid);
      if (bucket) bucket.push(row);
      else byMember.set(row.member_uuid, [row]);
    }

    return moves.map((move) => {
      const kept: ResponsibilityImpact[] = [];
      const lost: ResponsibilityImpact[] = [];

      for (const row of byMember.get(move.member_uuid) ?? []) {
        const verdict = evaluateAnchor(
          structureIndex,
          move.from_structure_uuid,
          move.to_structure_uuid,
          row.level_uuid,
        );

        const impact: ResponsibilityImpact = {
          member_responsibility_uuid: row.member_responsibility_uuid,
          responsibility_uuid: row.responsibility_uuid,
          responsibility_name: row.responsibility_name,
          level_uuid: row.level_uuid ?? null,
          level_name: row.level_name ?? null,
          ...verdict,
        };

        (impact.kept ? kept : lost).push(impact);
      }

      return {
        member_uuid: move.member_uuid,
        from_structure_uuid: move.from_structure_uuid,
        to_structure_uuid: move.to_structure_uuid,
        kept,
        lost,
      };
    });
  }

  /** Impact pour un seul membre. */
  async computeResponsibilityImpact(
    memberUuid: string,
    fromStructureUuid: string,
    toStructureUuid: string,
    index?: StructureIndex,
  ): Promise<MemberImpact> {
    const [impact] = await this.computeImpact(
      [
        {
          member_uuid: memberUuid,
          from_structure_uuid: fromStructureUuid,
          to_structure_uuid: toStructureUuid,
        },
      ],
      index,
    );

    return impact;
  }

  /** `true` si le déplacement traverse une frontière de district (⇒ workflow requis, R1). */
  async crossesDistrictBoundary(
    fromStructureUuid: string,
    toStructureUuid: string,
    index?: StructureIndex,
  ): Promise<boolean> {
    const structureIndex = index ?? (await this.loadStructureIndex());
    const [from, to] = await Promise.all([
      this.resolveDistrict(fromStructureUuid, structureIndex),
      this.resolveDistrict(toStructureUuid, structureIndex),
    ]);

    return from !== to;
  }
}
