/**
 * Seuils d'abandon d'une tentative de paiement.
 *
 * ⚠️ **Ils sont DEUX, et la différence est volontaire** - ils ne répondent pas à la même
 * question, et les confondre casse l'un ou l'autre :
 *
 * - `ABANDON_THRESHOLD_MINUTES` (15 min) répond à **« le membre est devant moi et redemande
 *   à payer »**. Il est court parce que le membre est là, qu'il constate lui-même que rien
 *   n'aboutit, et que c'est **lui** qui décide d'annuler : rien n'est fermé sans son accord.
 *
 * - `CRON_ABANDON_AFTER_HOURS` (24 h) répond à **« personne ne demande rien, et je vais
 *   refermer tout seul »**. Aucun humain ne valide le geste, donc la marge doit être large :
 *   on ne referme qu'une tentative dont plus personne ne peut raisonnablement se servir.
 *
 * Un seuil unique de 15 min appliqué au cron refermerait des paiements en cours de
 * validation chez l'opérateur ; un seuil unique de 24 h appliqué à l'écran laisserait un
 * membre bloqué une journée entière sur une tentative qu'il sait morte.
 */

/** Interactif : le membre demande explicitement à recommencer. Voir `PendingAttemptService`. */
export const ABANDON_THRESHOLD_MINUTES = 15;

/**
 * Automatique : le cron referme sans que personne ne l'ait demandé.
 *
 * ⚠️ **Et uniquement quand AUCUN paiement n'a jamais été engagé sur le lien** (le guichet
 * répond `payment: null`). Une tentative que HUB2 connaît - même « en attente » - n'est
 * jamais refermée par le cron : on ne peut pas exclure qu'elle aboutisse.
 */
export const CRON_ABANDON_AFTER_HOURS = 24;
