import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

/**
 * **Une fiche membre qui porte un paiement RÉUSSI ne se supprime pas** - RESPO-COMPTA-REGUL,
 * 2026-09-27.
 *
 * Constaté : trois doublons supprimés APRÈS avoir payé (15 000 F chacun). Les paiements restaient
 * accrochés à la fiche supprimée : lignes anonymes dans l'export comptable, et, sur la fiche
 * conservée, un membre qui paraissait n'avoir jamais payé - donc libre de payer une seconde fois.
 * Tant qu'il n'existe pas d'écran de fusion, le refus est le seul garde-fou : un administrateur
 * rattache d'abord les paiements à la fiche conservée (`npm run seed:reattach-deleted-member-payments`
 * pour les fiches déjà supprimées).
 *
 * Les tentatives échouées ou annulées ne bloquent pas : aucun argent n'y est attaché.
 * SQL brut : `payments` (latin1) n'a pas à être injecté dans un service déjà très chargé.
 */
export async function assertAucunPaiementReussi(
  manager: EntityManager,
  memberUuid: string,
): Promise<void> {
  const [ligne] = await manager.query(
    `SELECT COUNT(*) AS n FROM payments
      WHERE deleted_at IS NULL AND payment_status = 'paid'
        AND (actor_uuid = ? OR beneficiary_uuid = ?)`,
    [memberUuid, memberUuid],
  );
  const paiements = Number(ligne?.n ?? 0);
  if (paiements > 0) {
    throw new ConflictException({
      message:
        `Ce membre porte ${paiements} paiement(s) réussi(s) : la fiche ne peut pas être supprimée. `
        + 'S\'il s\'agit d\'un doublon, faites d\'abord rattacher ses paiements à la fiche conservée '
        + 'par un administrateur.',
      data: { code: 'MEMBRE_AVEC_PAIEMENTS', paiements },
    });
  }
}
