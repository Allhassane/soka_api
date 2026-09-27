import { In, Repository } from 'typeorm';
import { MemberEntity } from 'src/members/entities/member.entity';

/**
 * **Paiements portés par une fiche membre SUPPRIMÉE** (RESPO-COMPTA-REGUL, 2026-09-27).
 *
 * `leftJoinAndSelect('p.actor' | 'p.beneficiary')` écarte d'office une fiche supprimée : TypeORM
 * ajoute `AND deleted_at IS NULL` à la jointure (SQL vérifié), et `withDeleted()` ne la rétablit
 * pas. La ligne de paiement reste, sans payeur ni bénéficiaire - c'est ce qui a produit 3 lignes
 * anonymes dans l'export comptable le 27/09 (doublons supprimés après le paiement).
 *
 * Ces fonctions rechargent ces fiches explicitement et le disent à l'écran ou dans le fichier.
 */

/**
 * Recharge les fiches supprimées des payeurs et bénéficiaires manquants et les rattache aux
 * paiements (en place). Rend les uuid des fiches effectivement supprimées.
 */
export async function retablirFichesSupprimees(
  paiements: Array<{
    actor_uuid?: string | null;
    beneficiary_uuid?: string | null;
    actor?: MemberEntity | null;
    beneficiary?: MemberEntity | null;
  }>,
  memberRepo: Repository<MemberEntity>,
): Promise<Set<string>> {
  const manquants = new Set<string>();
  for (const p of paiements) {
    if (!p.actor && p.actor_uuid) manquants.add(p.actor_uuid);
    if (!p.beneficiary && p.beneficiary_uuid) manquants.add(p.beneficiary_uuid);
  }
  if (manquants.size === 0) return new Set();

  const fiches = await memberRepo.find({
    where: { uuid: In([...manquants]) },
    withDeleted: true,
    relations: { structure: true },
  });
  const parUuid = new Map(fiches.map((f) => [f.uuid, f]));

  for (const p of paiements) {
    if (!p.actor && p.actor_uuid) p.actor = parUuid.get(p.actor_uuid) ?? p.actor;
    if (!p.beneficiary && p.beneficiary_uuid) {
      p.beneficiary = parUuid.get(p.beneficiary_uuid) ?? p.beneficiary;
    }
  }
  return new Set(fiches.filter((f) => !!f.deleted_at).map((f) => f.uuid));
}

/** Ce qu'il faut savoir d'une ligne dont une fiche a été supprimée ; vide sinon. */
export function observationFiches(
  p: { actor_uuid?: string | null; beneficiary_uuid?: string | null },
  supprimees: Set<string>,
): string {
  const payeur = !!p.actor_uuid && supprimees.has(p.actor_uuid);
  const beneficiaire = !!p.beneficiary_uuid && supprimees.has(p.beneficiary_uuid);
  if (payeur && beneficiaire) {
    return p.actor_uuid === p.beneficiary_uuid
      ? 'Fiche du payeur et bénéficiaire supprimée'
      : 'Fiches du payeur et du bénéficiaire supprimées';
  }
  if (payeur) return 'Fiche du payeur supprimée';
  if (beneficiaire) return 'Fiche du bénéficiaire supprimée';
  return '';
}
