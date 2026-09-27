import { BadRequestException } from '@nestjs/common';
import { SelectQueryBuilder } from 'typeorm';
import { AccessScopeService } from 'src/access-scope/access-scope.service';
import { PaymentEntity } from 'src/payments/entities/payment.entity';
import { appliquerPerimetreBeneficiaire } from 'src/payments/campaign-payments-figures';

export interface FiltresPaiementsCompta {
  /** `payments.source` : `subscription` (abonnements) ou `donation` (zaimu). */
  type: string;
  /** `payments.source_uuid` = LA CAMPAGNE. Absent = toutes les campagnes du type. */
  campaign_uuid?: string;
  /** Le seau de la carte KPI : `all` + les 4 valeurs de `payments.payment_status`. */
  bucket: string;
  /**
   * Filtre « Structure » choisi à l'écran : le sous-arbre COMPLET de la structure retenue
   * (`structuresDuFiltreCompta`). Absent ou `null` = toutes les structures.
   */
  structures?: Set<string> | null;
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
 * 2. **Aucun périmètre de l'UTILISATEUR.** Les compteurs portent toute l'organisation : un
 *    export scopé au connecté serait plus court que le chiffre affiché, et rien ne signalerait
 *    l'écart - on ne remarque pas les lignes qui manquent.
 *
 * La seule restriction est le filtre « Structure » CHOISI dans le bloc de lignes (2026-09-27).
 * L'écran (`AccountingService.campaignPayments`) et le fichier appellent tous deux CETTE
 * fonction : il n'y a plus de copie à tenir synchronisée.
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

  // Structure du BÉNÉFICIAIRE, sous-arbre complet : la règle de RESPO-COMPTA-REGUL. Filtrer sur
  // une région rend donc exactement les paiements que voit le responsable de cette région.
  // Un paiement sans bénéficiaire rattaché ne ressort que sous « Toutes les structures ».
  appliquerPerimetreBeneficiaire(qb, f.structures ?? null);

  return qb.orderBy('p.created_at', 'DESC');
}

/**
 * **Ce que désigne la structure choisie** : `null` sans choix (toutes), sinon son sous-arbre
 * COMPLET, tous niveaux.
 *
 * ⚠️ Une structure inconnue est REFUSÉE (400), jamais traduite en tableau vide : « 0 ligne »
 * se lirait « rien de payé dans cette structure », ce qui serait faux. Pour l'export, le refus
 * tombe avant la création du job - il s'affiche à l'écran au lieu de finir en job `FAILED`.
 */
export async function structuresDuFiltreCompta(
  accessScope: Pick<AccessScopeService, 'sousArbre'>,
  structure_uuid?: string | null,
): Promise<Set<string> | null> {
  const uuid = structure_uuid?.trim();
  if (!uuid) return null;

  const structures = await accessScope.sousArbre(uuid);
  if (structures.size === 0) {
    throw new BadRequestException({
      message: 'Structure inconnue : le filtre ne désigne aucune structure existante.',
      data: { code: 'STRUCTURE_INCONNUE' },
    });
  }
  return structures;
}
