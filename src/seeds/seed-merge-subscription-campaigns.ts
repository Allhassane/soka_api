import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import AppDataSource from '../data-source';

/**
 * RAPATRIEMENT - Ramène vers la campagne d'abonnement officielle les paiements créés sur des
 * campagnes parallèles au même tarif, puis supprime (logiquement) les campagnes ainsi vidées.
 *
 * Contexte : au matin du lancement (01/08/2026), la campagne officielle n'existait pas encore.
 * Plusieurs responsables ont créé la leur - le plus souvent à leur propre nom - et des membres
 * s'y sont abonnés. Résultat : 34 lignes d'abonnement à 15 000 XOF réparties sur 6 campagnes
 * fantômes, dont 300 000 XOF réellement encaissés, invisibles dans les chiffres de la campagne
 * officielle. Ces personnes en sont absentes ; leur redemander de s'abonner les ferait payer
 * deux fois (le quota `max_payments_per_beneficiary` est compté PAR campagne).
 *
 * 🚨 **Ce script ne touche à AUCUN statut, montant ni quantité.** Il ne crédite rien, n'annule
 * rien, ne referme aucun lien de paiement. Il ne fait que RECLASSER : l'argent ne bouge pas,
 * seul son rattachement change. C'est délibérément un chemin distinct de `seed:sync-hub-payments`,
 * qui lui touche à l'argent.
 *
 * ── Ce qui est déplacé ───────────────────────────────────────────────────────────────────
 * Les lignes dont le **prix unitaire** (`amount / quantity`) vaut exactement PRIX_UNITAIRE,
 * portées par une campagne à ce même tarif, autre que la campagne officielle.
 *
 * ⚠️ Le filtre est le prix UNITAIRE, pas le montant de la ligne. Les deux cas que ça tranche :
 *   - une ligne à 30 000 pour 2 unités EST un abonnement à 15 000 pris en double → déplacée ;
 *   - une ligne à 15 000 pour 150 unités à 100 XOF n'est PAS un abonnement à 15 000 → laissée.
 * Un filtre littéral « montant = 15 000 » se tromperait dans les deux sens.
 *
 * ── Les deux tables, indissociables ──────────────────────────────────────────────────────
 * 🚨 `payments.source_uuid` porte **la campagne**, pas la ligne d'abonnement (vérifié sur les
 * 1 850 lignes de la base). Le rapatriement écrit donc dans DEUX tables, dans UNE transaction :
 *   - `subscription_payments.subscription_uuid`
 *   - `payments.source_uuid`
 * N'en mettre qu'une à jour ferait diverger l'abonnement et l'argent, en silence et sans
 * qu'aucun contrôle existant ne le détecte.
 *
 * ── Garde-fous ───────────────────────────────────────────────────────────────────────────
 * 1. **SIMULATION par défaut** : sans `--apply`, rien n'est écrit, la liste nominative est
 *    affichée.
 * 2. La campagne cible est vérifiée avant tout (existe, vivante, bon tarif) : un uuid qui ne
 *    correspond pas arrête le script plutôt que d'éparpiller des paiements.
 * 3. **`updated_at` est préservée** sur les deux tables (`updated_at = updated_at`) : l'argent
 *    n'a pas bougé, seul son classement. Les trois tables portent `ON UPDATE
 *    CURRENT_TIMESTAMP(6)`, une affectation explicite est le seul moyen de la neutraliser.
 *    Sans ça, la console d'assistance afficherait « modifié aujourd'hui » sur des paiements
 *    clos depuis des semaines.
 * 4. **Refus si le quota de la campagne cible serait dépassé** pour un bénéficiaire. Le script
 *    s'arrête sans rien écrire.
 * 5. **Refus si un paiement ne pointe pas la campagne attendue** : c'est le signe que les deux
 *    tables divergent déjà, et il faut alors comprendre pourquoi avant de déplacer quoi que ce soit.
 * 6. **Fichier de retour arrière** écrit AVANT toute écriture (`backups/`), contenant les UPDATE
 *    qui remettent tout en place.
 * 7. La suppression d'une campagne source est **logique** (`deleted_at`) et **conditionnelle** :
 *    seules celles dont on a effectivement déplacé des lignes ET qui n'en portent plus aucune.
 *    Une campagne au même tarif mais dont rien n'a été repris est laissée intacte.
 *
 * Idempotent : après le passage, les lignes pointent la campagne officielle et ne sont plus
 * candidates. Un second passage ne trouve rien.
 *
 * ── Exécution (depuis api/) ──────────────────────────────────────────────────────────────
 *   npm run seed:merge-subscription-campaigns             # simulation, n'écrit rien
 *   npm run seed:merge-subscription-campaigns -- --apply  # applique réellement
 *
 * 🪤 `npm run <seed> --apply` n'applique RIEN : npm consomme `--apply` comme un de ses propres
 * drapeaux et il n'atteint jamais `process.argv`. Le double tiret est obligatoire.
 */

const APPLY = process.argv.includes('--apply');

/** Campagne officielle : « CAMPAGNE D'ABONNEMENT LE SERMENT DU BONHEUR 2027 ». */
const CAMPAGNE_OFFICIELLE = '6fd0b8be-8d83-11f1-8c0f-fa6201c9ffe9';

/** Tarif des abonnements concernés. Tout autre prix unitaire reste en place. */
const PRIX_UNITAIRE = 15000;

type Campagne = {
  id: number;
  uuid: string;
  name: string;
  amount: number;
  status: string;
  max_payments_per_beneficiary: number | null;
  deleted_at: Date | null;
};

type Ligne = {
  uuid: string;
  campagne_id: number;
  campagne_nom: string;
  campagne_uuid: string;
  beneficiary_uuid: string;
  beneficiary_name: string;
  amount: number;
  quantity: number;
  status: string;
  payment_uuid: string | null;
  payment_source_uuid: string | null;
  payment_status: string | null;
};

const placeholders = (n: number) => Array(n).fill('?').join(', ');

const echec = (message: string): never => {
  console.error(`\n❌ ${message}`);
  console.error('   Rien n\'a été écrit.');
  process.exit(2);
};

async function run() {
  const ds = await AppDataSource.initialize();

  console.log(`\n[rapatriement] Base cible : ${ds.options.database as string}`);
  console.log(
    APPLY
      ? '[rapatriement] Mode : APPLICATION (les données seront modifiées)'
      : '[rapatriement] Mode : SIMULATION (aucune écriture - relancer avec « -- --apply »)',
  );

  try {
    // ── 1. La campagne cible ────────────────────────────────────────────────────────────
    const [cible]: Campagne[] = await ds.query(
      `SELECT id, uuid, name, amount, status, max_payments_per_beneficiary, deleted_at
         FROM subscriptions WHERE uuid = ?`,
      [CAMPAGNE_OFFICIELLE],
    );

    if (!cible) {
      echec(`Campagne officielle introuvable (uuid ${CAMPAGNE_OFFICIELLE}). Mauvaise base ?`);
    }
    if (cible.deleted_at !== null) {
      echec(`La campagne officielle « ${cible.name} » est supprimée.`);
    }
    if (Number(cible.amount) !== PRIX_UNITAIRE) {
      echec(
        `La campagne officielle est à ${cible.amount} XOF, or on rapatrie des abonnements à `
        + `${PRIX_UNITAIRE} XOF. Incohérence : vérifier CAMPAGNE_OFFICIELLE.`,
      );
    }

    console.log(`\nCampagne officielle  : #${cible.id} « ${cible.name} »`);
    console.log(`  tarif ${cible.amount} XOF · statut ${cible.status} · quota ${cible.max_payments_per_beneficiary ?? '(aucun)'}`);

    // ── 2. Les campagnes sources ────────────────────────────────────────────────────────
    const sources: Campagne[] = await ds.query(
      `SELECT id, uuid, name, amount, status, max_payments_per_beneficiary, deleted_at
         FROM subscriptions
        WHERE amount = ? AND uuid <> ? AND deleted_at IS NULL
        ORDER BY id`,
      [PRIX_UNITAIRE, CAMPAGNE_OFFICIELLE],
    );

    if (sources.length === 0) {
      console.log('\nAucune campagne parallèle à ce tarif. Rien à faire.');
      return;
    }

    console.log(`\nCampagnes parallèles au même tarif : ${sources.length}`);

    // ── 3. Les lignes candidates ────────────────────────────────────────────────────────
    const lignes: Ligne[] = await ds.query(
      `SELECT sp.uuid, s.id AS campagne_id, s.name AS campagne_nom, s.uuid AS campagne_uuid,
              sp.beneficiary_uuid, sp.beneficiary_name, sp.amount, sp.quantity, sp.status,
              sp.payment_uuid, p.source_uuid AS payment_source_uuid, p.payment_status
         FROM subscription_payments sp
         JOIN subscriptions s ON s.uuid = sp.subscription_uuid
    LEFT JOIN payments p ON p.uuid = sp.payment_uuid
        WHERE s.uuid IN (${placeholders(sources.length)})
        ORDER BY s.id, sp.created_at`,
      sources.map((s) => s.uuid),
    );

    // Le filtre porte sur le prix UNITAIRE, jamais sur le montant de la ligne.
    const retenues = lignes.filter(
      (l) => Number(l.quantity) > 0 && Number(l.amount) === PRIX_UNITAIRE * Number(l.quantity),
    );
    const ecartees = lignes.filter((l) => !retenues.includes(l));

    if (retenues.length === 0) {
      console.log('\nAucune ligne à rapatrier. Rien à faire.');
      return;
    }

    // ── 4. La liste nominative ──────────────────────────────────────────────────────────
    console.log(`\n── ${retenues.length} ligne(s) à rapatrier ─────────────────────────────`);
    let campagneCourante = -1;
    for (const l of retenues) {
      if (l.campagne_id !== campagneCourante) {
        campagneCourante = l.campagne_id;
        console.log(`\n  #${l.campagne_id} « ${l.campagne_nom} »`);
      }
      const unites = Number(l.quantity) > 1 ? ` ×${l.quantity}` : '';
      console.log(
        `     ${l.beneficiary_name.padEnd(34)} ${String(l.amount).padStart(7)} XOF${unites.padEnd(4)}`
        + ` ligne=${l.status.padEnd(9)} argent=${l.payment_status ?? '(aucun)'}`,
      );
    }

    if (ecartees.length > 0) {
      console.log(`\n── ${ecartees.length} ligne(s) ÉCARTÉE(S) (prix unitaire ≠ ${PRIX_UNITAIRE}) ──`);
      for (const l of ecartees) {
        const unitaire = Number(l.quantity) > 0 ? Number(l.amount) / Number(l.quantity) : NaN;
        console.log(
          `     #${l.campagne_id} ${l.beneficiary_name} : ${l.amount} XOF pour ${l.quantity} `
          + `unité(s) = ${Number.isFinite(unitaire) ? unitaire : '?'} XOF l'unité - laissée en place`,
        );
      }
    }

    // ── 5. Garde-fou : cohérence paiement ↔ abonnement AVANT de bouger ─────────────────
    const divergents = retenues.filter(
      (l) => l.payment_uuid && l.payment_source_uuid !== l.campagne_uuid,
    );
    if (divergents.length > 0) {
      console.error(`\n${divergents.length} paiement(s) ne pointent pas la campagne de leur ligne :`);
      for (const l of divergents) {
        console.error(`   ${l.beneficiary_name} : paiement → ${l.payment_source_uuid}, ligne → ${l.campagne_uuid}`);
      }
      echec('Les deux tables divergent déjà. Comprendre pourquoi avant tout déplacement.');
    }

    // ── 6. Garde-fou : le quota de la campagne cible ────────────────────────────────────
    const quota = cible.max_payments_per_beneficiary;
    if (quota !== null) {
      const dejaSurCible: { beneficiary_uuid: string; unites: string }[] = await ds.query(
        `SELECT beneficiary_uuid, SUM(quantity) AS unites
           FROM subscription_payments
          WHERE subscription_uuid = ? AND status = 'success'
          GROUP BY beneficiary_uuid`,
        [CAMPAGNE_OFFICIELLE],
      );
      const compteur = new Map<string, number>();
      for (const r of dejaSurCible) compteur.set(r.beneficiary_uuid, Number(r.unites));

      for (const l of retenues.filter((x) => x.status === 'success')) {
        compteur.set(
          l.beneficiary_uuid,
          (compteur.get(l.beneficiary_uuid) ?? 0) + Number(l.quantity),
        );
      }

      const depassements = retenues
        .filter((l) => (compteur.get(l.beneficiary_uuid) ?? 0) > quota)
        .map((l) => `${l.beneficiary_name} : ${compteur.get(l.beneficiary_uuid)} unités`);

      if (depassements.length > 0) {
        console.error(`\nLe quota de ${quota} unité(s) par bénéficiaire serait dépassé :`);
        for (const d of new Set(depassements)) console.error(`   ${d}`);
        echec('Rapatrier ces lignes rendrait la campagne officielle incohérente avec son propre quota.');
      }

      const maxApres = Math.max(...retenues.map((l) => compteur.get(l.beneficiary_uuid) ?? 0));
      console.log(`\nQuota : ${maxApres} unité(s) au maximum par bénéficiaire après rapatriement (limite ${quota}). ✅`);
    }

    // ── 7. Les campagnes qui se retrouveront vides ──────────────────────────────────────
    const deplaceesParCampagne = new Map<string, number>();
    for (const l of retenues) {
      deplaceesParCampagne.set(l.campagne_uuid, (deplaceesParCampagne.get(l.campagne_uuid) ?? 0) + 1);
    }
    const totalParCampagne = new Map<string, number>();
    for (const l of lignes) {
      totalParCampagne.set(l.campagne_uuid, (totalParCampagne.get(l.campagne_uuid) ?? 0) + 1);
    }

    // On ne supprime QUE les campagnes dont on a repris des lignes et qui n'en gardent aucune.
    // Une campagne au même tarif mais restée vide de tout temps n'a rien à voir avec ce
    // rapatriement : la supprimer serait un effet de bord non demandé.
    const aSupprimer = sources.filter(
      (s) =>
        (deplaceesParCampagne.get(s.uuid) ?? 0) > 0
        && (totalParCampagne.get(s.uuid) ?? 0) === (deplaceesParCampagne.get(s.uuid) ?? 0),
    );
    const conservees = sources.filter((s) => !aSupprimer.includes(s));

    console.log(`\n── ${aSupprimer.length} campagne(s) à supprimer (logiquement) après rapatriement ──`);
    for (const s of aSupprimer) {
      console.log(`     #${s.id} « ${s.name} » - ${deplaceesParCampagne.get(s.uuid)} ligne(s) reprise(s), 0 restante`);
    }
    if (conservees.length > 0) {
      console.log(`\n── ${conservees.length} campagne(s) CONSERVÉE(S) ─────────────────────────`);
      for (const s of conservees) {
        const reprises = deplaceesParCampagne.get(s.uuid) ?? 0;
        const restantes = (totalParCampagne.get(s.uuid) ?? 0) - reprises;
        console.log(
          `     #${s.id} « ${s.name} » - `
          + (reprises === 0
            ? 'aucune ligne reprise, elle ne relève pas de ce rapatriement'
            : `${restantes} ligne(s) restante(s) après reprise`),
        );
      }
    }

    // ── 8. Simulation : on s'arrête là ──────────────────────────────────────────────────
    const paiements = retenues.map((l) => l.payment_uuid).filter((u): u is string => !!u);
    const unites = retenues.reduce((n, l) => n + Number(l.quantity), 0);
    const encaisse = retenues
      .filter((l) => l.payment_status === 'paid')
      .reduce((n, l) => n + Number(l.amount), 0);

    console.log('\n──────────────────────────────────────────────');
    console.log(`Lignes d'abonnement à déplacer : ${retenues.length} (${unites} unités)`);
    console.log(`Paiements à repointer          : ${paiements.length}`);
    console.log(`Dont déjà encaissés            : ${encaisse.toLocaleString('fr-FR')} XOF`);
    console.log(`Campagnes à supprimer          : ${aSupprimer.length}`);

    if (!APPLY) {
      console.log('\nSimulation terminée - aucune écriture.');
      console.log('Pour appliquer : npm run seed:merge-subscription-campaigns -- --apply');
      return;
    }

    // ── 9. Retour arrière, écrit AVANT la moindre écriture ──────────────────────────────
    const dossier = join(process.cwd(), 'backups');
    mkdirSync(dossier, { recursive: true });
    const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
    const fichier = join(dossier, `rollback-rapatriement-campagnes-${horodatage}.sql`);

    const sql = [
      `-- Retour arrière du rapatriement des campagnes d'abonnement`,
      `-- Base : ${ds.options.database as string}`,
      `-- Généré le ${new Date().toISOString()}`,
      `-- ⚠️ À rejouer TEL QUEL et EN ENTIER : les trois blocs sont solidaires.`,
      `START TRANSACTION;`,
      ...retenues.map(
        (l) =>
          `UPDATE subscription_payments SET subscription_uuid = '${l.campagne_uuid}', `
          + `updated_at = updated_at WHERE uuid = '${l.uuid}';`,
      ),
      ...retenues
        .filter((l) => l.payment_uuid)
        .map(
          (l) =>
            `UPDATE payments SET source_uuid = '${l.payment_source_uuid}', `
            + `updated_at = updated_at WHERE uuid = '${l.payment_uuid}';`,
        ),
      ...aSupprimer.map(
        (s) => `UPDATE subscriptions SET deleted_at = NULL WHERE uuid = '${s.uuid}';`,
      ),
      `COMMIT;`,
      '',
    ].join('\n');

    writeFileSync(fichier, sql, 'utf8');
    console.log(`\n💾 Retour arrière écrit : ${fichier}`);

    // ── 10. L'écriture, en une transaction ──────────────────────────────────────────────
    await ds.transaction(async (m) => {
      // `updated_at = updated_at` neutralise le ON UPDATE CURRENT_TIMESTAMP(6) : l'argent n'a
      // pas bougé, seul son rattachement. Sans cette affectation explicite, MySQL réécrirait
      // la date sur les 34 lignes et la console d'assistance annoncerait « modifié aujourd'hui »
      // sur des paiements clos depuis des semaines.
      const rLignes = await m.query(
        `UPDATE subscription_payments
            SET subscription_uuid = ?, updated_at = updated_at
          WHERE uuid IN (${placeholders(retenues.length)})`,
        [CAMPAGNE_OFFICIELLE, ...retenues.map((l) => l.uuid)],
      );
      if (rLignes.affectedRows !== retenues.length) {
        throw new Error(
          `${rLignes.affectedRows} ligne(s) mise(s) à jour au lieu de ${retenues.length} - transaction annulée.`,
        );
      }

      if (paiements.length > 0) {
        const rPaiements = await m.query(
          `UPDATE payments
              SET source_uuid = ?, updated_at = updated_at
            WHERE uuid IN (${placeholders(paiements.length)}) AND source = 'subscription'`,
          [CAMPAGNE_OFFICIELLE, ...paiements],
        );
        if (rPaiements.affectedRows !== paiements.length) {
          throw new Error(
            `${rPaiements.affectedRows} paiement(s) repointé(s) au lieu de ${paiements.length} - transaction annulée.`,
          );
        }
      }

      if (aSupprimer.length > 0) {
        // Suppression LOGIQUE : `deleted_at` est la convention du projet (DateTimeEntity), et
        // elle laisse le retour arrière possible. `updated_at` bouge ici, c'est normal : la
        // campagne, elle, a bien changé d'état.
        const rCampagnes = await m.query(
          `UPDATE subscriptions
              SET deleted_at = CURRENT_TIMESTAMP(6)
            WHERE uuid IN (${placeholders(aSupprimer.length)}) AND deleted_at IS NULL`,
          aSupprimer.map((s) => s.uuid),
        );
        if (rCampagnes.affectedRows !== aSupprimer.length) {
          throw new Error(
            `${rCampagnes.affectedRows} campagne(s) supprimée(s) au lieu de ${aSupprimer.length} - transaction annulée.`,
          );
        }
      }
    });

    console.log('\n✅ Rapatriement appliqué.');

    // ── 11. Contrôles après écriture ────────────────────────────────────────────────────
    const [apres]: { lignes: string; succes: string; encaisse: string | null }[] = await ds.query(
      `SELECT COUNT(*) AS lignes,
              SUM(status = 'success') AS succes,
              SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) AS encaisse
         FROM subscription_payments WHERE subscription_uuid = ?`,
      [CAMPAGNE_OFFICIELLE],
    );
    const [restes]: { n: string }[] = await ds.query(
      `SELECT COUNT(*) AS n FROM subscription_payments
        WHERE subscription_uuid IN (${placeholders(sources.length)})`,
      sources.map((s) => s.uuid),
    );
    const [divergence]: { n: string }[] = await ds.query(
      `SELECT COUNT(*) AS n
         FROM subscription_payments sp
         JOIN payments p ON p.uuid = sp.payment_uuid
        WHERE sp.subscription_uuid = ? AND p.source_uuid <> sp.subscription_uuid`,
      [CAMPAGNE_OFFICIELLE],
    );

    console.log('\nContrôles :');
    console.log(`  campagne officielle       : ${apres.lignes} lignes, ${apres.succes} payées, ${Number(apres.encaisse ?? 0).toLocaleString('fr-FR')} XOF`);
    console.log(`  restant sur les sources   : ${restes.n} ligne(s)`);
    console.log(`  paiement ↔ abonnement     : ${divergence.n} divergence(s) (attendu 0)`);
    console.log(`  campagnes supprimées      : ${aSupprimer.length}`);

    if (Number(divergence.n) > 0) {
      console.error('\n⚠️  Des paiements ne pointent pas la même campagne que leur ligne.');
      console.error(`   Retour arrière disponible : ${fichier}`);
      process.exit(1);
    }
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[rapatriement] Échec :', err);
  process.exit(1);
});
