import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LevelEntity } from 'src/level/entities/level.entity';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { User } from 'src/users/entities/user.entity';
import {
  ResponsibilityAnchorService,
  StructureIndex,
  ancestorAtLevel,
} from 'src/member-transfer/responsibility-anchor.service';
import {
  MemberRegistrationEntity,
  RegistrationStatus,
  StepDecision,
  ValidationLevel,
} from './entities/member-registration.entity';

/** Niveaux porteurs des deux étapes de validation (comparés en majuscules). */
export const DISTRICT_LEVEL_NAME = 'DISTRICT';
export const CHAPITRE_LEVEL_NAME = 'CHAPITRE';

export interface LevelRef {
  uuid: string;
  name: string;
  /** Plus l'ordre est **petit**, plus le niveau est **élevé** (NATIONAL = 0, SOUS_GROUPE = 7). */
  order: number;
}

/**
 * Une autorité d'un utilisateur : sa responsabilité de niveau L, et la structure sur laquelle
 * elle s'ancre **pour lui** (calculée en remontant depuis la structure où il habite - un
 * responsable n'habite pas la structure qu'il dirige).
 */
export interface AuthorityAnchor {
  level_uuid: string;
  level_name: string;
  level_order: number;
  anchor_structure_uuid: string;
}

export interface StepPlan {
  district: StepDecision;
  chapitre: StepDecision;
  status: RegistrationStatus;
  /**
   * Motif de refus quand **aucune étape n'est opposable** et que le déposant n'a pas l'autorité
   * pour s'en passer (saisie au-dessus du chapitre). `null` = dépôt recevable.
   */
  blocked: string | null;
}

export interface SignVerdict {
  allowed: boolean;
  /** Signature du niveau supérieur, le niveau de l'étape étant vacant (règle R5b). */
  by_delegation: boolean;
}

/**
 * Tout ce qu'il faut pour trancher des signatures sans retoucher la base : l'arbre, les niveaux
 * et les signataires des trois niveaux concernés, groupés par structure.
 */
export interface SignatureContext {
  index: StructureIndex;
  levels: LevelRef[];
  district: LevelRef | null;
  chapitre: LevelRef | null;
  /** Niveau juste au-dessus du chapitre (CENTRE en pratique) : son suppléant. */
  auDessusDuChapitre: LevelRef | null;
  byLevel: Map<string, Map<string, Set<string>>>;
}

/* ────────────────────────── Fonctions pures (le cœur des règles) ────────────────────────── */

/**
 * Le porteur de ces autorités a-t-il autorité sur `dossierStructureUuid` à un niveau **au moins
 * aussi élevé** que `stepOrder` ?
 *
 * Deux conditions cumulées, et la seconde est celle qu'on oublie : il ne suffit pas d'être
 * responsable de district, il faut être responsable **de ce district-là** - d'où la comparaison
 * d'ancres, la même que la règle R8 du transfert.
 *
 * Fonction **pure**.
 */
export function hasAuthorityOver(
  index: StructureIndex,
  anchors: AuthorityAnchor[],
  dossierStructureUuid: string | null | undefined,
  stepOrder: number,
): boolean {
  return anchors.some(
    (a) =>
      a.level_order <= stepOrder &&
      ancestorAtLevel(index, dossierStructureUuid, a.level_uuid) ===
        a.anchor_structure_uuid,
  );
}

/**
 * **Règle R4 - étapes requises à la soumission.**
 *
 * Une étape est acquise d'office si le déposant a déjà autorité à ce niveau ou au-dessus : un
 * dossier ne **redescend** jamais la hiérarchie pour être approuvé par un subordonné.
 *
 * Fonction **pure**.
 */
export function planSteps(input: {
  index: StructureIndex;
  anchors: AuthorityAnchor[];
  structureUuid: string | null | undefined;
  districtUuid: string | null;
  chapitreUuid: string | null;
  districtOrder: number;
  chapitreOrder: number;
  isAdmin: boolean;
}): StepPlan {
  const {
    index,
    anchors,
    structureUuid,
    districtUuid,
    chapitreUuid,
    districtOrder,
    chapitreOrder,
    isAdmin,
  } = input;

  const autoriteDistrict =
    isAdmin || hasAuthorityOver(index, anchors, structureUuid, districtOrder);
  const autoriteChapitre =
    isAdmin || hasAuthorityOver(index, anchors, structureUuid, chapitreOrder);

  const district =
    districtUuid === null
      ? StepDecision.SANS_OBJET
      : autoriteDistrict
        ? StepDecision.ACQUISE
        : StepDecision.EN_ATTENTE;

  const chapitre =
    chapitreUuid === null
      ? StepDecision.SANS_OBJET
      : autoriteChapitre
        ? StepDecision.ACQUISE
        : StepDecision.EN_ATTENTE;

  // Saisie au-dessus du chapitre : il n'existe ni district ni chapitre à faire signer. On
  // n'accepte alors le dépôt que de quelqu'un qui a déjà l'autorité à ce niveau - sinon le
  // circuit se contournerait en choisissant une structure assez haute.
  const blocked =
    districtUuid === null && chapitreUuid === null && !autoriteChapitre
      ? "Cette structure n'a ni district ni chapitre au-dessus d'elle : seul un responsable de " +
        'ce niveau (ou au-dessus) peut y enregistrer un membre.'
      : null;

  const status =
    district === StepDecision.EN_ATTENTE
      ? RegistrationStatus.EN_ATTENTE_DISTRICT
      : chapitre === StepDecision.EN_ATTENTE
        ? RegistrationStatus.EN_ATTENTE_CHAPITRE
        : RegistrationStatus.VALIDEE;

  return { district, chapitre, status, blocked };
}

const AUCUN_SIGNATAIRE: ReadonlySet<string> = new Set<string>();

/**
 * **Règles R5 / R5b**, calculées **en mémoire**.
 *
 * Isolée des requêtes pour deux raisons : elle est la règle, donc elle doit être testable sans
 * base ; et l'écran « à valider » doit pouvoir trancher des dizaines de dossiers d'un coup, sans
 * une requête par ligne.
 *
 * Fonction **pure**.
 */
export function evaluateSignature(input: {
  index: StructureIndex;
  userUuid: string;
  isAdmin: boolean;
  /** Niveau de l'étape (null ⇒ niveau absent de l'arbre). */
  stepLevelUuid: string | null;
  /** Structure portant l'étape (null ⇒ étape SANS_OBJET : rien à signer). */
  stepStructureUuid: string | null;
  /** Niveau immédiatement supérieur, seul habilité à suppléer. */
  upperLevelUuid: string | null;
  dossierStructureUuid: string | null;
  /** Signataires du niveau de l'étape, par structure. */
  signers: Map<string, Set<string>>;
  /** Signataires du niveau supérieur, par structure. */
  upperSigners: Map<string, Set<string>>;
}): SignVerdict {
  const {
    index,
    userUuid,
    isAdmin,
    stepLevelUuid,
    stepStructureUuid,
    upperLevelUuid,
    dossierStructureUuid,
    signers,
    upperSigners,
  } = input;

  // Étape SANS_OBJET : le dossier ne l'attend pas, personne ne la signe - pas même un admin.
  if (!stepLevelUuid || !stepStructureUuid) {
    return { allowed: false, by_delegation: false };
  }

  const direct = signers.get(stepStructureUuid) ?? AUCUN_SIGNATAIRE;
  if (direct.has(userUuid)) return { allowed: true, by_delegation: false };

  // Suppléance : elle ne s'ouvre QUE sur un niveau vacant. Tant qu'il est pourvu, le supérieur
  // est refusé - c'est ce qui garde deux regards distincts sur chaque dossier.
  if (direct.size === 0 && upperLevelUuid) {
    const upperStructure = ancestorAtLevel(index, dossierStructureUuid, upperLevelUuid);
    if (upperStructure) {
      const delegates = upperSigners.get(upperStructure) ?? AUCUN_SIGNATAIRE;
      if (delegates.has(userUuid)) return { allowed: true, by_delegation: true };
    }
  }

  return { allowed: isAdmin, by_delegation: false };
}

/* ─────────────────────────────────────── Service ─────────────────────────────────────────── */

/**
 * Autorité de validation d'un enregistrement de membre : qui peut déposer sans signature, qui
 * peut signer quelle étape, et quand la suppléance s'ouvre.
 *
 * ⚠️ **À ne pas confondre avec le périmètre.** `AccessScopeService` répond à « quelles données
 * ai-je le droit de voir » et inclut les **comités** ; ce service répond à « de qui puis-je me
 * porter garant », et ne regarde que les **responsabilités**. Appartenir à un comité de chapitre
 * donne des permissions, pas l'autorité d'attester qu'une personne existe.
 *
 * Spécification : `docs/VALIDATION-MEMBRES.md` §4 et §5.
 */
@Injectable()
export class RegistrationAuthorityService {
  constructor(
    private readonly anchors: ResponsibilityAnchorService,
    @InjectRepository(LevelEntity)
    private readonly levelRepository: Repository<LevelEntity>,
    @InjectRepository(MemberResponsibilityEntity)
    private readonly memberResponsibilityRepository: Repository<MemberResponsibilityEntity>,
    @InjectRepository(MemberEntity)
    private readonly memberRepository: Repository<MemberEntity>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Niveaux **réellement utilisés par l'arbre des structures**, du plus élevé au plus bas.
   *
   * La table `levels` mélange deux catégories (`level` / `responsibility`) et peut contenir des
   * homonymes : on ne garde que ceux qui apparaissent dans l'arbre, seuls comparables à une
   * ancre. Même précaution que `ResponsibilityAnchorService.resolveLevelUuidByName()`.
   */
  async orderedLevels(index: StructureIndex): Promise<LevelRef[]> {
    const used = new Set<string>();
    for (const node of index.values()) {
      if (node.level_uuid) used.add(node.level_uuid);
    }

    const levels = await this.levelRepository.find({
      select: ['uuid', 'name', 'order'],
    });

    return levels
      .filter((l) => used.has(l.uuid))
      .map((l) => ({ uuid: l.uuid, name: (l.name ?? '').toUpperCase(), order: l.order }))
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Autorités d'un utilisateur : ses responsabilités actives, chacune ancrée sur la structure
   * qu'elle dirige réellement.
   *
   * ⚠️ Une responsabilité dont le `level_uuid` est NULL (104 porteurs en base) est **ignorée** :
   * on ne sait pas la situer, donc elle n'ouvre aucun droit - ni pour signer, ni pour acquérir
   * une étape d'office. Fail closed dans les deux sens (R5).
   */
  async authorityAnchors(
    userUuid: string,
    index: StructureIndex,
    levels: LevelRef[],
  ): Promise<AuthorityAnchor[]> {
    const user = await this.userRepository.findOne({
      where: { uuid: userUuid },
      select: ['uuid', 'member_uuid'],
    });
    if (!user?.member_uuid) return [];

    const member = await this.memberRepository.findOne({
      where: { uuid: user.member_uuid },
      select: ['uuid', 'structure_uuid'],
    });
    if (!member?.structure_uuid) return [];

    // Jointure sur `responsibility_uuid` : les FK numériques de `member_responsibilities` sont
    // NULL sur toutes les lignes migrées (piège documenté dans `api/CLAUDE.md`).
    const rows: Array<{ level_uuid: string | null }> =
      await this.memberResponsibilityRepository
        .createQueryBuilder('mr')
        .innerJoin(
          'responsibilities',
          'r',
          "r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL AND (r.status IS NULL OR r.status = 'enable')",
        )
        .select('r.level_uuid', 'level_uuid')
        .where('mr.member_uuid = :memberUuid', { memberUuid: member.uuid })
        .andWhere('mr.deleted_at IS NULL')
        .getRawMany();

    const byUuid = new Map(levels.map((l) => [l.uuid, l]));
    const result: AuthorityAnchor[] = [];

    for (const row of rows) {
      if (!row.level_uuid) continue; // niveau indéterminé ⇒ aucune autorité
      const level = byUuid.get(row.level_uuid);
      if (!level) continue;

      const anchor = ancestorAtLevel(index, member.structure_uuid, level.uuid);
      if (!anchor) continue; // porteur rattaché au-dessus de son propre niveau : indéterminable

      result.push({
        level_uuid: level.uuid,
        level_name: level.name,
        level_order: level.order,
        anchor_structure_uuid: anchor,
      });
    }

    return result;
  }

  /**
   * Utilisateurs capables de signer pour `structureUuid` au niveau `levelUuid`.
   *
   * Un responsable **sans compte actif** ne compte pas : il ne peut pas se connecter, donc pas
   * signer, et le considérer comme présent rendrait le niveau faussement pourvu - donc le
   * dossier durablement bloqué (360 membres étaient dans ce cas jusqu'au 2026-08-01).
   */
  async signerUserUuids(
    levelUuid: string,
    structureUuid: string,
    index: StructureIndex,
  ): Promise<Set<string>> {
    const parStructure = await this.signersByStructure(levelUuid, index);
    return parStructure.get(structureUuid) ?? new Set<string>();
  }

  /**
   * Tous les signataires d'un niveau, groupés par structure dirigée, **en une requête**.
   *
   * La requête ne peut pas filtrer sur la structure : un responsable n'habite pas la structure
   * qu'il dirige, le rattachement se calcule en remontant les ancêtres. On charge donc les
   * porteurs du niveau (quelques centaines au plus : 928 pour DISTRICT) et on les range en
   * mémoire - même parti pris que `loadStructureIndex()`, pour ne pas refaire les milliers de
   * requêtes qui avaient causé un timeout passerelle.
   */
  async signersByStructure(
    levelUuid: string,
    index: StructureIndex,
  ): Promise<Map<string, Set<string>>> {
    const rows: Array<{ user_uuid: string; structure_uuid: string | null }> =
      await this.memberResponsibilityRepository
        .createQueryBuilder('mr')
        .innerJoin(
          'responsibilities',
          'r',
          "r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL AND (r.status IS NULL OR r.status = 'enable')",
        )
        .innerJoin('members', 'm', 'm.uuid = mr.member_uuid AND m.deleted_at IS NULL')
        .innerJoin(
          'users',
          'u',
          'u.member_uuid = m.uuid AND u.deleted_at IS NULL AND u.is_active = 1',
        )
        .select(['u.uuid AS user_uuid', 'm.structure_uuid AS structure_uuid'])
        .where('r.level_uuid = :levelUuid', { levelUuid })
        .andWhere('mr.deleted_at IS NULL')
        .getRawMany();

    const parStructure = new Map<string, Set<string>>();
    for (const row of rows) {
      const structure = ancestorAtLevel(index, row.structure_uuid, levelUuid);
      if (!structure) continue;
      const bucket = parStructure.get(structure);
      if (bucket) bucket.add(row.user_uuid);
      else parStructure.set(structure, new Set([row.user_uuid]));
    }
    return parStructure;
  }

  /**
   * Contexte de signature : l'arbre, les niveaux, et les signataires des trois niveaux qui
   * peuvent intervenir (DISTRICT, CHAPITRE, et CENTRE comme suppléant du chapitre).
   *
   * Chargé **une fois par requête**, puis réutilisé pour trancher autant de dossiers qu'il faut.
   */
  async signatureContext(): Promise<SignatureContext> {
    const index = await this.anchors.loadStructureIndex();
    const levels = await this.orderedLevels(index);

    const district = levels.find((l) => l.name === DISTRICT_LEVEL_NAME) ?? null;
    const chapitre = levels.find((l) => l.name === CHAPITRE_LEVEL_NAME) ?? null;
    // Suppléant du chapitre : le niveau juste au-dessus de lui, quel qu'il soit.
    const auDessusDuChapitre = chapitre
      ? (levels[levels.findIndex((l) => l.uuid === chapitre.uuid) - 1] ?? null)
      : null;

    const byLevel = new Map<string, Map<string, Set<string>>>();
    for (const level of [district, chapitre, auDessusDuChapitre]) {
      if (level && !byLevel.has(level.uuid)) {
        byLevel.set(level.uuid, await this.signersByStructure(level.uuid, index));
      }
    }

    return { index, levels, district, chapitre, auDessusDuChapitre, byLevel };
  }

  /** Signataires d'un niveau dans un contexte déjà chargé (jamais `undefined`). */
  signersOf(ctx: SignatureContext, levelUuid: string | null): Map<string, Set<string>> {
    return (levelUuid && ctx.byLevel.get(levelUuid)) || new Map();
  }

  /**
   * Verdict de signature d'une étape, à partir d'un contexte déjà chargé.
   * C'est le point d'entrée unique : `canSign` et l'écran « à valider » passent par ici.
   */
  verdictFor(
    ctx: SignatureContext,
    userUuid: string,
    isAdmin: boolean,
    level: ValidationLevel,
    registration: Pick<
      MemberRegistrationEntity,
      'structure_uuid' | 'district_uuid' | 'chapitre_uuid'
    >,
  ): SignVerdict {
    const estDistrict = level === ValidationLevel.DISTRICT;
    const stepLevel = estDistrict ? ctx.district : ctx.chapitre;
    const upperLevel = estDistrict ? ctx.chapitre : ctx.auDessusDuChapitre;

    return evaluateSignature({
      index: ctx.index,
      userUuid,
      isAdmin,
      stepLevelUuid: stepLevel?.uuid ?? null,
      stepStructureUuid: estDistrict
        ? registration.district_uuid
        : registration.chapitre_uuid,
      upperLevelUuid: upperLevel?.uuid ?? null,
      dossierStructureUuid: registration.structure_uuid,
      signers: this.signersOf(ctx, stepLevel?.uuid ?? null),
      upperSigners: this.signersOf(ctx, upperLevel?.uuid ?? null),
    });
  }

  /** Ancres et étapes requises pour une saisie. Ne touche pas la base au-delà des lectures. */
  async planForSubmission(
    userUuid: string,
    isAdmin: boolean,
    structureUuid: string | null | undefined,
  ): Promise<{
    plan: StepPlan;
    district_uuid: string | null;
    chapitre_uuid: string | null;
  }> {
    const index = await this.anchors.loadStructureIndex();
    const levels = await this.orderedLevels(index);

    const district = levels.find((l) => l.name === DISTRICT_LEVEL_NAME);
    const chapitre = levels.find((l) => l.name === CHAPITRE_LEVEL_NAME);

    const district_uuid = district
      ? ancestorAtLevel(index, structureUuid, district.uuid)
      : null;
    const chapitre_uuid = chapitre
      ? ancestorAtLevel(index, structureUuid, chapitre.uuid)
      : null;

    const anchors = await this.authorityAnchors(userUuid, index, levels);

    const plan = planSteps({
      index,
      anchors,
      structureUuid,
      districtUuid: district_uuid,
      chapitreUuid: chapitre_uuid,
      // Niveaux absents de l'arbre : on retombe sur l'ordre réel de la hiérarchie SOKA plutôt
      // que d'ouvrir l'acquisition d'office à tout le monde.
      districtOrder: district?.order ?? 5,
      chapitreOrder: chapitre?.order ?? 4,
      isAdmin,
    });

    return { plan, district_uuid, chapitre_uuid };
  }

  /**
   * **Règles R5 / R5b.** Cet utilisateur peut-il signer cette étape de ce dossier ?
   *
   * Ordre de résolution, volontairement dans cet ordre :
   * 1. il est le responsable du niveau exact, ancré sur la bonne structure → signature normale ;
   * 2. **sinon**, si ce niveau est **vacant** ici, le niveau immédiatement supérieur signe → la
   *    signature est marquée « par suppléance ». La suppléance est donc **calculée, jamais
   *    choisie** : tant que le niveau est pourvu, le supérieur reçoit un refus ;
   * 3. `is_admin` en dernier recours, y compris si toute la chaîne est vacante.
   */
  async canSign(
    userUuid: string,
    isAdmin: boolean,
    level: ValidationLevel,
    registration: Pick<
      MemberRegistrationEntity,
      'structure_uuid' | 'district_uuid' | 'chapitre_uuid'
    >,
  ): Promise<SignVerdict> {
    const ctx = await this.signatureContext();
    return this.verdictFor(ctx, userUuid, isAdmin, level, registration);
  }

  /** `true` si personne ne peut signer ce niveau ici (R13 : à afficher, jamais à taire). */
  async isLevelVacant(levelName: string, structureUuid: string): Promise<boolean> {
    const index = await this.anchors.loadStructureIndex();
    const levels = await this.orderedLevels(index);
    const level = levels.find((l) => l.name === levelName.toUpperCase());
    if (!level) return true;

    const signers = await this.signerUserUuids(level.uuid, structureUuid, index);
    return signers.size === 0;
  }
}
