import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import AppDataSource from '../data-source';
import { JournalEditionEntity } from '../journals/entities/journal-edition.entity';
import { SubscriptionEntity } from '../subscriptions/entities/subscription.entity';
import { SubscriptionPaymentEntity } from '../subscription-payment/entities/subscription-payment.entity';
import { MemberEntity } from '../members/entities/member.entity';
import { GlobalStatus } from '../shared/enums/global-status.enum';

/**
 * SEED — Simuler le paiement de TOUS les membres pour une édition de journal.
 *
 * Crée des `subscription_payments` au statut SUCCESS (bénéficiaire = membre)
 * pour la campagne d'abonnement liée à l'édition. C'est exactement ce que lit
 * la vue de réception / distribution du détail d'édition → permet de tester et
 * visualiser le comportement avec des données réalistes.
 *
 * Exécution (depuis soka_api) :
 *   npm run seed:edition-payments
 *
 * Pour ANNULER ensuite (repartir de zéro sur cette campagne) :
 *   DELETE FROM subscription_payments WHERE subscription_uuid = '<uuid_campagne>';
 */

// -- Configuration ----------------------------------------------------------
// UUID de l'édition ciblée (SERMENT DU BONHEUR).
const EDITION_UUID = 'acc2136b-760d-4a2a-b3c5-0944f9de86da';
// 0 = tous les membres ; sinon limite le nombre (test plus léger).
const LIMIT = 0;
// true = uniquement les membres rattachés à une structure (peuplent
// districts/zones) ; false = inclure aussi ceux sans structure.
const ONLY_WITH_STRUCTURE = true;
// ---------------------------------------------------------------------------

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[seed] Base cible : ${ds.options.database as string}`);

  try {
    const editionRepo = ds.getRepository(JournalEditionEntity);
    const subRepo = ds.getRepository(SubscriptionEntity);
    const payRepo = ds.getRepository(SubscriptionPaymentEntity);
    const memberRepo = ds.getRepository(MemberEntity);

    const edition = await editionRepo.findOne({ where: { uuid: EDITION_UUID } });
    if (!edition) {
      throw new Error(`Édition ${EDITION_UUID} introuvable`);
    }
    if (!edition.subscription_uuid) {
      throw new Error("Cette édition n'est liée à aucune campagne d'abonnement.");
    }
    const subscriptionUuid = edition.subscription_uuid;
    const sub = await subRepo.findOne({ where: { uuid: subscriptionUuid } });
    console.log(
      `[seed] Édition : ${edition.title} N°${edition.number} → campagne : ${
        sub?.name ?? subscriptionUuid
      }`,
    );

    const amount = Math.max(0, Math.round(Number(sub?.amount ?? 0)));

    // Membres cibles
    const qb = memberRepo
      .createQueryBuilder('m')
      .select([
        'm.uuid AS uuid',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.structure_uuid AS structure_uuid',
      ]);
    if (ONLY_WITH_STRUCTURE) qb.where('m.structure_uuid IS NOT NULL');
    if (LIMIT > 0) qb.limit(LIMIT);
    const members: {
      uuid: string;
      firstname: string | null;
      lastname: string | null;
      structure_uuid: string | null;
    }[] = await qb.getRawMany();
    console.log(`[seed] Membres cibles : ${members.length}`);

    // Idempotence : ne pas recréer pour un bénéficiaire déjà présent.
    const existing = await payRepo.find({
      where: { subscription_uuid: subscriptionUuid },
      select: ['beneficiary_uuid'],
    });
    const existingSet = new Set(existing.map((p) => p.beneficiary_uuid));

    const rows = members
      .filter((m) => m.uuid && !existingSet.has(m.uuid))
      .map((m) => {
        const name =
          `${m.lastname ?? ''} ${m.firstname ?? ''}`.trim() || m.uuid;
        return payRepo.create({
          amount,
          quantity: 1,
          subscription_uuid: subscriptionUuid,
          beneficiary_uuid: m.uuid,
          beneficiary_name: name,
          actor_uuid: m.uuid,
          actor_name: name,
          payment_uuid: uuidv4(),
          status: GlobalStatus.SUCCESS,
        });
      });

    const chunk = 500;
    for (let i = 0; i < rows.length; i += chunk) {
      await payRepo.save(rows.slice(i, i + chunk));
      console.log(`[seed]   ...${Math.min(i + chunk, rows.length)}/${rows.length}`);
    }

    const totalPaid = await payRepo.count({
      where: { subscription_uuid: subscriptionUuid, status: GlobalStatus.SUCCESS },
    });
    console.log(
      `[seed] Paiements créés : ${rows.length} | déjà présents : ${existingSet.size}`,
    );
    console.log(
      `[seed] Bénéficiaires payés (SUCCESS) pour la campagne : ${totalPaid}`,
    );
    console.log('[seed] Terminé. Ouvre le détail de l’édition pour visualiser.');
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[seed] Échec :', err);
  process.exit(1);
});
