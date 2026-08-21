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

/**
 * **Fenêtre pendant laquelle une tentative CLOSE reste ré-interrogée au guichet.**
 *
 * 🚨 Née d'une perte mesurée le 2026-08-20 : **30 000 XOF encaissés et jamais crédités**, sur
 * 2 paiements. Le membre rate sa validation, le guichet répond `failed`, le cron referme la
 * ligne - **puis le membre recommence sur le MÊME lien et réussit** (47 min plus tard dans un
 * cas, 9 min dans l'autre). L'argent arrive, et plus personne ne regarde.
 *
 * La cause tient en une phrase : **un `failed` est définitif côté application, alors que le
 * lien reste PAYABLE côté guichet.** Un lien HUB2 n'expire pas (`expiresAt: null`), passe
 * simplement `used`, et n'est désactivé que par le geste explicite du membre
 * (`cancelHubPaymentByTransactionId`). Rien, ni webhook ni rappel, ne vient dire à
 * l'application qu'un lien qu'elle a enterré vient d'encaisser.
 *
 * ⚠️ **Ne pas confondre avec les deux seuils ci-dessus** : ils décident quand REFERMER,
 * celui-ci décide combien de temps on continue de VÉRIFIER après avoir refermé. Un `failed`
 * n'est donc plus une sortie définitive, c'est une sortie **provisoire**.
 *
 * 48 h est un compromis : au-delà, c'est le contrôle d'invariant quotidien
 * (`seed:reconcile-hub-payments`) qui prend le relais - lui n'a pas de fenêtre.
 */
export const RECHECK_CLOSED_FOR_HOURS = Number(
  process.env.HUB_RECHECK_CLOSED_HOURS ?? 48,
);
