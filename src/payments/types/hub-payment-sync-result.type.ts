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
  errors: number;
}
