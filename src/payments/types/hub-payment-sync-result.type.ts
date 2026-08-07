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
}
