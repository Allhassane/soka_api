/**
 * Fondations du module Statistiques : permissions, fragments SQL partagés et
 * construction du `WHERE` commun à TOUS les indicateurs.
 *
 * Règle de fond : **un filtre change le dénominateur partout**. C'est la raison pour
 * laquelle le `WHERE` est construit à un seul endroit et injecté dans chaque requête -
 * si chaque indicateur composait le sien, deux tuiles du même écran finiraient par
 * compter des populations différentes.
 */

// --- RBAC ------------------------------------------------------------------
/** Entrée de menu. */
export const PERM_STATS_MENU = 'statistiques_voir_menu_statistiques';
/** Les écrans membres eux-mêmes. */
export const PERM_STATS_MEMBRES = 'statistiques_voir_statistiques_membres';

// --- Périmètre -------------------------------------------------------------
export interface StatsPerimeter {
  isAdmin: boolean;
  /** Racines autorisées, issues du JWT (`scope_structure_uuid`). */
  allowedRootUuids: string[];
}

// --- Filtres ---------------------------------------------------------------
export interface MemberFilters {
  structure_uuid?: string;
  department_uuid?: string;
  division_uuid?: string;
  gender?: string;
  age_bucket?: string;
  seniority_bucket?: string;
  /** Bornes sur la date d'ADHÉSION (`membership_date`), jamais sur `created_at`. */
  from?: string;
  to?: string;
  has_gohonzon?: string;
  account_status?: string;
  responsibility?: string;
  marital_status_uuid?: string;
  country_uuid?: string;
  city_uuid?: string;
}

/**
 * Âge en années révolues. ⚠️ Toujours accompagné de `AGE_PLAUSIBLE` : la base contient des
 * dates de naissance en 0199 et en 2070 (13 lignes au 2026-08-19). Une moyenne calculée sans
 * ce garde-fou est fausse de plusieurs années.
 */
export const AGE_EXPR = 'TIMESTAMPDIFF(YEAR, m.birth_date, CURDATE())';
export const AGE_PLAUSIBLE = `m.birth_date IS NOT NULL AND ${AGE_EXPR} BETWEEN 0 AND 110`;

/**
 * Ancienneté d'adhésion en années. Même précaution : `membership_date` va de 0204 à 3013.
 * 🚨 **Jamais `created_at`** - c'est la date d'entrée dans l'APPLICATION (6 733 membres créés
 * en mai 2025, l'import de masse), pas la date d'adhésion à l'association.
 */
export const ANCIENNETE_EXPR = 'TIMESTAMPDIFF(YEAR, m.membership_date, CURDATE())';
export const ADHESION_PLAUSIBLE =
  'm.membership_date IS NOT NULL AND YEAR(m.membership_date) BETWEEN 1960 AND YEAR(CURDATE())';

/** Tranches d'âge - la clé est ce que le web renvoie dans `age_bucket`. */
export const AGE_BUCKETS: Array<{ cle: string; libelle: string; min: number; max: number | null }> = [
  { cle: 'moins_18', libelle: 'Moins de 18 ans', min: 0, max: 17 },
  { cle: '18_24', libelle: '18 à 24 ans', min: 18, max: 24 },
  { cle: '25_34', libelle: '25 à 34 ans', min: 25, max: 34 },
  { cle: '35_44', libelle: '35 à 44 ans', min: 35, max: 44 },
  { cle: '45_59', libelle: '45 à 59 ans', min: 45, max: 59 },
  { cle: '60_plus', libelle: '60 ans et plus', min: 60, max: null },
];

/** Tranches d'ancienneté d'adhésion. */
export const ANCIENNETE_BUCKETS: Array<{ cle: string; libelle: string; min: number; max: number | null }> = [
  { cle: 'moins_1', libelle: "Moins d'un an", min: 0, max: 0 },
  { cle: '1_5', libelle: '1 à 5 ans', min: 1, max: 5 },
  { cle: '5_10', libelle: '5 à 10 ans', min: 6, max: 10 },
  { cle: '10_20', libelle: '10 à 20 ans', min: 11, max: 20 },
  { cle: 'plus_20', libelle: 'Plus de 20 ans', min: 21, max: null },
];

/** Expression SQL `CASE` qui range chaque membre dans sa tranche (ou `non_renseigne`). */
export function bucketCase(
  expr: string,
  garde: string,
  buckets: Array<{ cle: string; min: number; max: number | null }>,
): string {
  const branches = buckets.map((b) =>
    b.max === null
      ? `WHEN ${expr} >= ${b.min} THEN '${b.cle}'`
      : `WHEN ${expr} BETWEEN ${b.min} AND ${b.max} THEN '${b.cle}'`,
  );
  return `CASE WHEN NOT (${garde}) THEN 'non_renseigne' ${branches.join(' ')} ELSE 'non_renseigne' END`;
}

export interface WhereClause {
  /** Fragment `AND …` prêt à concaténer (commence par `AND`, ou vide). */
  sql: string;
  params: any[];
  /** `true` si le périmètre impose une jointure `users` (filtre sur l'état du compte). */
  besoinCompte: boolean;
}

/**
 * Construit le `WHERE` commun. L'alias des membres est TOUJOURS `m`, celui des comptes `u`.
 *
 * 🚨 **Le périmètre n'est pas un filtre comme les autres** : il n'est pas fourni par
 * l'appelant, il vient du JWT. Un non-administrateur sans racine de périmètre ne voit
 * **rien** (`1 = 0`) - jamais « tout par défaut ». C'est la règle qui a manqué à
 * `GET /structure/members/:uuid` en juillet 2025 (fuite de tout l'arbre en changeant l'uuid).
 *
 * ⚠️ Le périmètre passe par `structure_closure`, qui ne couvre pas la totalité des structures
 * (3 562 sur 3 769 au 2026-08-19). Conséquence assumée : les membres rattachés à une structure
 * absente de l'arbre sont invisibles pour un responsable. Le sens de l'erreur est le bon (on
 * cache plutôt que de divulguer), et l'écran Qualité les compte explicitement pour que
 * personne ne prenne ce trou pour un effectif réel.
 */
export function buildMemberWhere(
  filters: MemberFilters,
  perimeter: StatsPerimeter,
): WhereClause {
  const parts: string[] = [];
  const params: any[] = [];

  // --- Périmètre ---
  if (!perimeter.isAdmin) {
    const racines = (perimeter.allowedRootUuids ?? []).filter(Boolean);
    if (racines.length === 0) {
      parts.push('1 = 0');
    } else {
      parts.push(
        `m.structure_uuid IN (
           SELECT sc.descendant_uuid FROM structure_closure sc
            WHERE sc.ancestor_uuid IN (${racines.map(() => '?').join(',')})
         )`,
      );
      params.push(...racines);
    }
  }

  // --- Structure choisie dans la cascade : son sous-arbre, en PLUS du périmètre ---
  if (filters.structure_uuid) {
    parts.push(
      `m.structure_uuid IN (
         SELECT sc2.descendant_uuid FROM structure_closure sc2 WHERE sc2.ancestor_uuid = ?
       )`,
    );
    params.push(filters.structure_uuid);
  }

  if (filters.department_uuid) {
    parts.push('m.department_uuid = ?');
    params.push(filters.department_uuid);
  }
  if (filters.division_uuid) {
    // `non_renseignee` est une valeur de filtre à part entière : c'est ainsi qu'on trouve
    // les membres JEUNESSE sans division (108 au 2026-08-19).
    if (filters.division_uuid === 'non_renseignee') parts.push('m.division_uuid IS NULL');
    else {
      parts.push('m.division_uuid = ?');
      params.push(filters.division_uuid);
    }
  }
  if (filters.gender) {
    parts.push('m.gender = ?');
    params.push(filters.gender);
  }
  if (filters.marital_status_uuid) {
    parts.push('m.marital_status_uuid = ?');
    params.push(filters.marital_status_uuid);
  }
  if (filters.country_uuid) {
    parts.push('m.country_uuid = ?');
    params.push(filters.country_uuid);
  }
  if (filters.city_uuid) {
    parts.push('m.city_uuid = ?');
    params.push(filters.city_uuid);
  }

  const age = AGE_BUCKETS.find((b) => b.cle === filters.age_bucket);
  if (age) {
    parts.push(
      age.max === null
        ? `(${AGE_PLAUSIBLE} AND ${AGE_EXPR} >= ${age.min})`
        : `(${AGE_PLAUSIBLE} AND ${AGE_EXPR} BETWEEN ${age.min} AND ${age.max})`,
    );
  } else if (filters.age_bucket === 'non_renseigne') {
    parts.push(`NOT (${AGE_PLAUSIBLE})`);
  }

  const anc = ANCIENNETE_BUCKETS.find((b) => b.cle === filters.seniority_bucket);
  if (anc) {
    parts.push(
      anc.max === null
        ? `(${ADHESION_PLAUSIBLE} AND ${ANCIENNETE_EXPR} >= ${anc.min})`
        : `(${ADHESION_PLAUSIBLE} AND ${ANCIENNETE_EXPR} BETWEEN ${anc.min} AND ${anc.max})`,
    );
  }

  if (filters.from) {
    parts.push('m.membership_date >= ?');
    params.push(filters.from);
  }
  if (filters.to) {
    parts.push('m.membership_date <= ?');
    params.push(filters.to);
  }

  if (filters.has_gohonzon === 'true') parts.push('m.has_gohonzon = 1');
  if (filters.has_gohonzon === 'false') parts.push('m.has_gohonzon = 0');

  let besoinCompte = false;
  switch (filters.account_status) {
    case 'connected':
      besoinCompte = true;
      parts.push('u.is_connected = 1');
      break;
    case 'never':
      besoinCompte = true;
      parts.push('u.uuid IS NOT NULL AND (u.is_connected IS NULL OR u.is_connected <> 1)');
      break;
    case 'sent_not_connected':
      besoinCompte = true;
      parts.push('u.is_sent = 1 AND (u.is_connected IS NULL OR u.is_connected <> 1)');
      break;
    case 'default_password':
      besoinCompte = true;
      parts.push('u.must_change_password = 1');
      break;
    case 'no_account':
      besoinCompte = true;
      parts.push('u.uuid IS NULL');
      break;
  }

  if (filters.responsibility === 'with') {
    parts.push(
      `EXISTS (SELECT 1 FROM member_responsibilities mr
                WHERE mr.member_uuid = m.uuid AND mr.deleted_at IS NULL)`,
    );
  }
  if (filters.responsibility === 'without') {
    parts.push(
      `NOT EXISTS (SELECT 1 FROM member_responsibilities mr
                    WHERE mr.member_uuid = m.uuid AND mr.deleted_at IS NULL)`,
    );
  }

  return {
    sql: parts.length ? ` AND ${parts.join(' AND ')}` : '',
    params,
    besoinCompte,
  };
}

/**
 * Bloc `FROM` commun. La jointure `users` est TOUJOURS posée : plusieurs indicateurs en ont
 * besoin (entonnoir, joignabilité) et `IDX_users_member_uuid` la rend gratuite. La poser
 * conditionnellement obligerait chaque requête à savoir si le filtre courant l'exige - une
 * complexité pour rien.
 */
export const FROM_MEMBRES = `
  FROM members m
  LEFT JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NULL
 WHERE m.deleted_at IS NULL`;

/** Pourcentage arrondi à une décimale, `0` quand la base est vide (jamais `NaN` ni ∞). */
export function taux(part: number, base: number): number {
  if (!base || base <= 0) return 0;
  return Math.round((part / base) * 1000) / 10;
}

/** `Number()` défensif : MySQL rend les COUNT en chaîne via le driver. */
export function n(valeur: unknown): number {
  const x = Number(valeur ?? 0);
  return Number.isFinite(x) ? x : 0;
}
