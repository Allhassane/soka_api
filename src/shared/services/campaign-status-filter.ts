import { ForbiddenException } from '@nestjs/common';

/**
 * Filtre par statut des campagnes (Abonnements et Zaimu), et droit de s'en servir.
 *
 * ── La règle ─────────────────────────────────────────────────────────────────────────────
 * **Par défaut, seules les campagnes EN COURS sont visibles.** Une liste sans paramètre ne
 * renvoie donc que les `started` - c'est vrai pour tout le monde, administrateur compris : les
 * campagnes archivées ou terminées encombrent l'écran sans servir au quotidien.
 *
 * Voir autre chose demande le **droit de filtrer** (`abonnements_filtrer_par_statut`,
 * `dons_filtrer_par_statut`). Sans ce droit, demander un autre statut est **refusé** plutôt
 * qu'ignoré : un filtre silencieusement neutralisé donnerait l'illusion d'une liste complète.
 *
 * ⚠️ Le contrôle est ici, côté API, et pas seulement dans l'écran. Masquer le sélecteur dans le
 * front n'empêche personne d'ajouter `?status=archived` à l'URL.
 */

/** Statuts qu'une campagne peut porter dans les écrans Abonnements / Zaimu. */
export const STATUTS_CAMPAGNE = [
  'created',
  'started',
  'stopped',
  'canceled',
  'completed',
  'archived',
] as const;

export type StatutCampagne = (typeof STATUTS_CAMPAGNE)[number];

/** Valeur spéciale du sélecteur : « tous les statuts ». */
export const STATUT_TOUS = 'all';

/** Statut affiché quand l'appelant ne demande rien. */
export const STATUT_PAR_DEFAUT: StatutCampagne = 'started';

export interface StatutResolu {
  /** Statut à appliquer en base, ou `null` pour « ne pas filtrer ». */
  statut: StatutCampagne | null;
}

/**
 * Traduit le paramètre reçu en filtre applicable, en vérifiant le droit.
 *
 * @param demande      valeur du paramètre `status` (absente = défaut)
 * @param peutFiltrer  l'appelant détient-il le droit de filtrer ?
 */
export function resoudreStatutCampagne(
  demande: string | undefined | null,
  peutFiltrer: boolean,
): StatutResolu {
  const valeur = (demande ?? '').trim().toLowerCase();

  // Rien de demandé, ou le défaut demandé explicitement : accordé à tous, sans exiger de droit.
  // Le front envoie `status=started` même quand le sélecteur est masqué - le refuser rendrait la
  // liste inaccessible aux rôles sans le droit, alors que la valeur ne dévoile rien de plus.
  if (valeur === '' || valeur === STATUT_PAR_DEFAUT) {
    return { statut: STATUT_PAR_DEFAUT };
  }

  if (!peutFiltrer) {
    throw new ForbiddenException(
      "Vous n'avez pas le droit de filtrer les campagnes par statut.",
    );
  }

  if (valeur === STATUT_TOUS) return { statut: null };

  if (!(STATUTS_CAMPAGNE as readonly string[]).includes(valeur)) {
    throw new ForbiddenException(
      `Statut inconnu : ${valeur}. Valeurs acceptées : ${STATUTS_CAMPAGNE.join(', ')}, ${STATUT_TOUS}.`,
    );
  }

  return { statut: valeur as StatutCampagne };
}
