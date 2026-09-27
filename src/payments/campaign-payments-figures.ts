import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { PaymentEntity, PaymentStatus } from './entities/payment.entity';

/**
 * **UNE définition des chiffres financiers d'une campagne vus par un responsable** -
 * RESPO-COMPTA-REGUL, 2026-09-27.
 *
 * Un paiement réussi, c'est ce que compte la Comptabilité : `payments.payment_status = 'paid'`,
 * pour le montant `total_amount`, sur la campagne `payments.source_uuid`. Le périmètre est celui de
 * `AccessScopeService.perimetreFinancier`, appliqué à la structure du **BÉNÉFICIAIRE** - comme
 * l'export comptable, le rapport public et la liste générale des paiements.
 *
 * 🚨 Avant : trois définitions de « réussi » (ligne métier, `payment_status`, `payments.status`),
 * un rattachement par PAYEUR, et les seuls sous-groupes - la somme des régions ne retombait
 * jamais sur le chiffre des comptables. Fiches de campagne, liste et export passent désormais tous
 * par ici : le chiffre affiché = les lignes « payé » de la liste = les lignes du fichier.
 */

/**
 * Borne un query builder sur `payments` au périmètre, par la structure du bénéficiaire.
 *
 * - `null` : global, aucune condition ;
 * - vide : **aucune ligne** (`1 = 0`) - jamais « toute la campagne » (fuite corrigée : sans
 *   sous-groupe sous sa racine, la liste ne posait aucun filtre) ;
 * - sinon : le bénéficiaire est rattaché à l'une des structures.
 *
 * ⚠️ Sous-requête SQL écrite à la main, SANS filtre `deleted_at` : un paiement reste à la structure
 * de son bénéficiaire même si la fiche a été supprimée depuis. Une jointure ORM écarterait d'office
 * les fiches supprimées (TypeORM ajoute la condition à la jointure).
 */
export function appliquerPerimetreBeneficiaire<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  structures: Set<string> | null,
  alias = 'p',
): SelectQueryBuilder<T> {
  if (structures === null) return qb;
  if (structures.size === 0) return qb.andWhere('1 = 0');
  return qb.andWhere(
    `${alias}.beneficiary_uuid IN (SELECT pm.uuid FROM members pm WHERE pm.structure_uuid IN (:...perimetreStructures))`,
    { perimetreStructures: [...structures] },
  );
}

/**
 * La recherche par nom de la liste des paiements, sur le payeur ou le bénéficiaire.
 * ⚠️ Exige les jointures `actor` et `beneficiary` sur le query builder.
 */
export function appliquerRechercheNoms<T extends ObjectLiteral>(
  qb: SelectQueryBuilder<T>,
  recherche?: string,
): SelectQueryBuilder<T> {
  const terme = recherche?.trim();
  if (!terme) return qb;
  return qb.andWhere(
    `(
      LOWER(actor.firstname) LIKE LOWER(:recherche) OR
      LOWER(actor.lastname) LIKE LOWER(:recherche) OR
      LOWER(beneficiary.firstname) LIKE LOWER(:recherche) OR
      LOWER(beneficiary.lastname) LIKE LOWER(:recherche) OR
      CONCAT(LOWER(actor.firstname), ' ', LOWER(actor.lastname)) LIKE LOWER(:recherche) OR
      CONCAT(LOWER(beneficiary.firstname), ' ', LOWER(beneficiary.lastname)) LIKE LOWER(:recherche)
    )`,
    { recherche: `%${terme}%` },
  );
}

export interface ChiffresReussis {
  nombre: number;
  montant: number;
  /** Bénéficiaires distincts. */
  beneficiaires: number;
}

/** Paiements réussis d'une campagne dans un périmètre (et une recherche éventuelle). */
export async function chiffresReussis(
  repo: Repository<PaymentEntity>,
  campagneUuid: string,
  structures: Set<string> | null,
  recherche?: string,
): Promise<ChiffresReussis> {
  const qb = repo
    .createQueryBuilder('p')
    .select('COUNT(*)', 'nombre')
    .addSelect('COALESCE(SUM(p.total_amount), 0)', 'montant')
    .addSelect('COUNT(DISTINCT p.beneficiary_uuid)', 'beneficiaires')
    .where('p.source_uuid = :campagne', { campagne: campagneUuid })
    .andWhere('p.payment_status = :paye', { paye: PaymentStatus.PAID });

  if (recherche?.trim()) {
    qb.leftJoin('p.actor', 'actor').leftJoin('p.beneficiary', 'beneficiary');
    appliquerRechercheNoms(qb, recherche);
  }
  appliquerPerimetreBeneficiaire(qb, structures);

  const r = await qb.getRawOne<{ nombre: string; montant: string; beneficiaires: string }>();
  return {
    nombre: Number(r?.nombre ?? 0),
    montant: Number(r?.montant ?? 0),
    beneficiaires: Number(r?.beneficiaires ?? 0),
  };
}
