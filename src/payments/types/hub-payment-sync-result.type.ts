export type HubPaymentSyncStatus =
  | 'paid'
  | 'failed'
  | 'pending'
  | 'not_found';

export interface HubPaymentSyncResult {
  status: HubPaymentSyncStatus;
  transaction_id: string;
  payment_uuid?: string;
  donation_uuid?: string | null;
  subscription_payment_uuid?: string | null;
  hub_payment?: unknown;
}

export interface HubPaymentSyncBatchResult {
  processed: number;
  paid: number;
  failed: number;
  pending: number;
  /**
   * Tentatives refermées par le cron : aucun paiement n'a jamais été engagé sur le lien et
   * le délai d'abandon est dépassé. C'est ce compteur qui fait **décroître** la file - sans
   * lui, elle grossit sans fin et le cron interroge éternellement des liens morts.
   */
  abandoned: number;
  errors: number;
  /**
   * **Tentatives CLOSES qui se sont avérées encaissées** et qui viennent d'être créditées.
   *
   * 🚨 Ce compteur doit rester à 0 en régime normal. Toute valeur non nulle veut dire qu'un
   * membre a payé sur un lien que l'application avait enterré - c'est le défaut du 2026-08-20
   * (30 000 XOF). Il est compté à part de `paid` précisément pour qu'il se VOIE dans le
   * journal du cron : noyé dans `paid`, il redeviendrait invisible.
   */
  recredited: number;
}
