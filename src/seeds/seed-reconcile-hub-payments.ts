import 'reflect-metadata';
import axios from 'axios';
import AppDataSource from '../data-source';

/**
 * AUDIT (LECTURE SEULE) - **de l'argent encaissé par le guichet a-t-il échappé à l'application ?**
 *
 * Né du défaut du 2026-08-07 : **585 000 XOF encaissés et jamais crédités**, sur 38 paiements,
 * parce que le cron de synchronisation triait la file du plus ANCIEN au plus récent avec un
 * plafond - les paiements récents n'étaient donc jamais interrogés (détail dans `JOURNAL.md`
 * et dans le gotcha « Cron de synchronisation » de `CLAUDE.md`).
 *
 * Ce seed est le **détecteur** de cette famille de pannes : pour chaque paiement que
 * l'application croit encore « en attente », il demande au guichet ce qu'il en est. Tout
 * paiement que le guichet dit **encaissé** est de l'argent versé par un membre et non crédité.
 *
 * ⚠️ **Il n'écrit RIEN** - ni dans `soka_db`, ni au guichet. Aucune route `POST` n'est appelée.
 * Créditer est le travail du cron, qui passe par `syncHubPaymentByTransactionId` : c'est le
 * chemin déjà éprouvé, et il pose aussi la ligne d'écriture métier. Recopier cette logique ici
 * ferait une **deuxième route vers le même argent**, et deux routes finissent toujours par
 * diverger - c'est précisément ce genre de duplication qui produit les écarts qu'on mesure.
 *
 * ⚠️ Il n'interroge que les paiements **en attente** : ce sont les seuls à risque. Un paiement
 * déjà `paid` ou `failed` est définitif côté application.
 *
 * Sortie : un tableau récapitulatif et, s'il y a des écarts, la liste nominative.
 * **Code de sortie 1** quand un écart est trouvé, pour pouvoir servir de sonde de supervision.
 *
 * Exécution (depuis api/) :
 *   npm run seed:reconcile-hub-payments
 */

const API_URL =
  process.env.HUB_API_URL ??
  'https://pay-api.sokagakkaici.org/api/v1/payment-links';
const API_KEY = process.env.HUB_API_KEY;
const TIMEOUT_MS = Number(process.env.HUB_TIMEOUT_MS ?? 8000);

/** Interrogations menées de front. Le guichet est un service de production : on reste sobre. */
const CONCURRENCE = 5;

interface LignePaiement {
  payment_uuid: string;
  transaction_id: string;
  total_amount: string | number;
  created_at: Date;
  beneficiaire: string | null;
  telephone: string | null;
  campagne: string | null;
}

type Verdict = 'encaisse' | 'echoue' | 'en_attente' | 'inconnu' | 'erreur';

async function interroger(ligne: LignePaiement): Promise<Verdict> {
  try {
    const { data } = await axios.get(
      `${API_URL}/${encodeURIComponent(ligne.transaction_id)}/status`,
      {
        headers: { Authorization: `Bearer ${API_KEY}` },
        timeout: TIMEOUT_MS,
      },
    );

    if (data?.paid === true) return 'encaisse';

    const statut = String(data?.payment?.status ?? '').toLowerCase();
    if (statut === 'failed' || statut === 'cancelled' || statut === 'canceled') {
      return 'echoue';
    }
    return 'en_attente';
  } catch (error: any) {
    // 404 : le guichet ne connaît pas ce lien (souvent une clé pointant le mauvais
    // environnement - les liens de production sont inconnus d'un guichet sandbox).
    if (error?.response?.status === 404) return 'inconnu';
    return 'erreur';
  }
}

async function main() {
  if (!API_KEY) {
    console.error(
      "HUB_API_KEY n'est pas configurée : impossible d'interroger le guichet.",
    );
    process.exit(2);
  }

  const ds = await AppDataSource.initialize();

  /**
   * ⚠️ Le même filtre que le cron, à dessein : si les deux divergeaient, l'audit déclarerait
   * « tout va bien » sur une population que la synchronisation ne traite pas.
   */
  const lignes: LignePaiement[] = await ds.query(`
    SELECT p.uuid            AS payment_uuid,
           p.transaction_id  AS transaction_id,
           p.total_amount    AS total_amount,
           p.created_at      AS created_at,
           p.beneficiary_name AS beneficiaire,
           m.phone           AS telephone,
           s.name            AS campagne
    FROM payments p
    LEFT JOIN subscription_payments sp ON sp.payment_uuid = p.uuid
    LEFT JOIN subscriptions s ON s.uuid = sp.subscription_uuid
    LEFT JOIN members m ON m.uuid = sp.beneficiary_uuid
    WHERE p.payment_status = 'pending'
      AND p.status IN ('init','pending')
      AND p.transaction_id LIKE 'plink_%'
    ORDER BY p.created_at DESC
  `);

  console.log(`\nPaiements « en attente » à vérifier : ${lignes.length}`);
  console.log(`Guichet interrogé : ${API_URL}\n`);

  const compteurs: Record<Verdict, number> = {
    encaisse: 0,
    echoue: 0,
    en_attente: 0,
    inconnu: 0,
    erreur: 0,
  };
  const nonCredites: Array<LignePaiement> = [];

  for (let i = 0; i < lignes.length; i += CONCURRENCE) {
    const lot = lignes.slice(i, i + CONCURRENCE);
    const verdicts = await Promise.all(lot.map(interroger));

    lot.forEach((ligne, j) => {
      const verdict = verdicts[j];
      compteurs[verdict] += 1;
      if (verdict === 'encaisse') nonCredites.push(ligne);
    });

    process.stdout.write(
      `\r  ${Math.min(i + CONCURRENCE, lignes.length)}/${lignes.length} interrogés…`,
    );
  }
  process.stdout.write('\n\n');

  const montant = nonCredites.reduce(
    (total, l) => total + Number(l.total_amount ?? 0),
    0,
  );

  console.log('RÉCAPITULATIF');
  console.log(`  encaissés au guichet, NON crédités : ${compteurs.encaisse}`);
  console.log(`  échoués (à refermer)               : ${compteurs.echoue}`);
  console.log(`  réellement en attente              : ${compteurs.en_attente}`);
  console.log(`  liens inconnus du guichet          : ${compteurs.inconnu}`);
  console.log(`  erreurs d'interrogation            : ${compteurs.erreur}`);

  if (!nonCredites.length) {
    console.log('\n✅ Aucun encaissement non crédité. Application et guichet sont alignés.');
    await ds.destroy();
    process.exit(0);
  }

  console.log(
    `\n🚨 ${nonCredites.length} paiement(s) encaissé(s) et non crédité(s) — `
    + `${montant.toLocaleString('fr-FR')} XOF\n`,
  );
  for (const l of nonCredites) {
    console.log(
      `  ${new Date(l.created_at).toISOString().slice(0, 16).replace('T', ' ')}  `
      + `${String(Number(l.total_amount)).padStart(7)} XOF  `
      + `${(l.beneficiaire ?? '?').padEnd(38)} ${l.telephone ?? ''}  ${l.transaction_id}`,
    );
  }
  console.log(
    `\nRien n'a été modifié. Le cron de synchronisation les crédite de lui-même à son `
    + `prochain passage (toutes les 10 min) — relancer cet audit ensuite doit rendre 0.`,
  );

  await ds.destroy();
  // Code 1 : permet d'en faire une sonde de supervision.
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
