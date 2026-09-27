import { SelectQueryBuilder } from 'typeorm';
import { PaymentEntity, PaymentStatus } from 'src/payments/entities/payment.entity';
import { appliquerPerimetreBeneficiaire } from 'src/payments/campaign-payments-figures';

/**
 * **Filtre de l'export des transactions d'une campagne** (bouton « Exporter » des fiches de
 * campagne, module Exports) - RESPO-COMPTA-REGUL, 2026-09-27.
 *
 * 🚨 Le fichier doit contenir EXACTEMENT les lignes que compte la fiche de campagne du même
 * utilisateur : même périmètre (`perimetreFinancier`, par le BÉNÉFICIAIRE), même vérité
 * (`payments.payment_status`). Avant : périmètre `responsibilities[0]`, sous-groupes seuls,
 * rattachement par PAYEUR, statut métier `payments.status` - trois raisons d'un écart.
 */
export interface FiltresExportTransactions {
  source_uuid: string;
  /** `perimetreFinancier(...).structures` : `null` = global. */
  structures: Set<string> | null;
  /** Valeur envoyée par l'écran (`success`, `fail`, `pending`, `all`…). */
  status?: string | null;
}

/**
 * Traduit le filtre de statut de l'écran vers le statut du GUICHET. `null` = tous les statuts.
 * Les valeurs métier historiques (`success`, `fail`, `canceled`) restent acceptées : c'est ce
 * qu'envoie l'écran.
 */
export function statutGuichetDepuisExport(status?: string | null): PaymentStatus | null {
  switch ((status ?? '').trim().toLowerCase()) {
    case '':
    case 'all':
      return null;
    case 'success':
    case 'paid':
      return PaymentStatus.PAID;
    case 'fail':
    case 'failed':
      return PaymentStatus.FAILED;
    case 'canceled':
    case 'cancelled':
      return PaymentStatus.CANCELLED;
    case 'pending':
    case 'init':
      return PaymentStatus.PENDING;
    default:
      // Valeur inconnue : on filtre dessus tel quel (0 ligne) plutôt que de tout livrer.
      return status as PaymentStatus;
  }
}

export function appliquerFiltresExportTransactions(
  qb: SelectQueryBuilder<PaymentEntity>,
  f: FiltresExportTransactions,
): SelectQueryBuilder<PaymentEntity> {
  qb.where('p.source_uuid = :source_uuid', { source_uuid: f.source_uuid });
  appliquerPerimetreBeneficiaire(qb, f.structures);

  const statut = statutGuichetDepuisExport(f.status);
  if (statut) qb.andWhere('p.payment_status = :statutGuichet', { statutGuichet: statut });

  return qb.orderBy('p.created_at', 'DESC');
}
