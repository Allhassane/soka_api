import { SelectQueryBuilder } from 'typeorm';
import { PaymentEntity } from 'src/payments/entities/payment.entity';

export interface FiltresPaiementsCompta {
  /** `payments.source` : `subscription` (abonnements) ou `donation` (zaimu). */
  type: string;
  /** `payments.source_uuid` = LA CAMPAGNE. Absent = toutes les campagnes du type. */
  campaign_uuid?: string;
  /** Le seau de la carte KPI : `all` + les 4 valeurs de `payments.payment_status`. */
  bucket: string;
}

/**
 * **Le filtre de l'export comptable - copie conforme de celui de l'écran.**
 *
 * 🚨 Il reproduit `AccountingService.campaignPayments` condition pour condition, parce que le
 * fichier doit contenir EXACTEMENT les lignes que compte la tuile cliquée. Deux pièges à ne
 * jamais réintroduire :
 *
 * 1. **`payments` a DEUX colonnes de statut.** L'export du module Exports filtre `p.status`
 *    (statut métier) ; la Comptabilité affiche et compte **`p.payment_status`** (celui du
 *    guichet). Recopier le filtre du voisin rendrait un fichier plausible et faux.
 * 2. **Aucun périmètre de structure.** L'écran n'en applique aucun : les compteurs portent
 *    toute l'organisation. Un export scopé serait plus court que le chiffre affiché, et rien
 *    ne signalerait l'écart - on ne remarque pas les lignes qui manquent.
 */
export function appliquerFiltresPaiementsCompta(
  qb: SelectQueryBuilder<PaymentEntity>,
  f: FiltresPaiementsCompta,
): SelectQueryBuilder<PaymentEntity> {
  qb.where('p.source = :type', { type: f.type });

  if (f.campaign_uuid) {
    qb.andWhere('p.source_uuid = :campagne', { campagne: f.campaign_uuid });
  }

  // `all` = la tuile « Paiement initié » : tous les statuts, donc aucune condition.
  if (f.bucket && f.bucket !== 'all') {
    qb.andWhere('p.payment_status = :seau', { seau: f.bucket });
  }

  return qb.orderBy('p.created_at', 'DESC');
}
