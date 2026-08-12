import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import AppDataSource from '../data-source';

/**
 * MÉNAGE DES CAMPAGNES D'ABONNEMENT - vide puis supprime les campagnes parasites, pour que le
 * sélecteur du module Comptabilité ne propose plus que des campagnes qui veulent dire quelque
 * chose.
 *
 * Deux règles, demandées le 2026-08-12 :
 *   A. Toute campagne **archivée au plein tarif** (15 000) est vidée sur la **campagne en cours**
 *      (l'unique campagne à 15 000 de statut `started`) : ses abonnements y sont rapatriés,
 *      **quel que soit leur statut** - un échec ou une annulation appartient à l'historique de la
 *      campagne vivante, pas à une campagne fantôme.
 *   B. Toute campagne **sous le plein tarif** (essais à 100, à 1…) est vidée sur la **campagne de
 *      test**, qui devient le seul réceptacle des essais.
 * Les campagnes ainsi vidées sont supprimées **logiquement** (`deleted_at`), y compris celles qui
 * n'ont jamais porté aucune ligne : elles ne servent qu'à encombrer le sélecteur.
 *
 * 🚨 **Ce script ne touche à AUCUN statut, montant ni quantité.** Il ne crédite rien, n'annule
 * rien, ne referme aucun lien de paiement. Il RECLASSE : l'argent ne bouge pas, seul son
 * rattachement change. C'est un chemin délibérément distinct de `seed:sync-hub-payments`, qui lui
 * touche à l'argent.
 *
 * ── Les deux tables, indissociables ──────────────────────────────────────────────────────────
 * 🚨 `payments.source_uuid` porte **la campagne**, pas la ligne d'abonnement. Reclasser écrit donc
 * dans DEUX tables, dans UNE transaction :
 *   - `subscription_payments.subscription_uuid`
 *   - `payments.source_uuid`
 * N'en mettre qu'une à jour ferait diverger l'abonnement et l'argent, en silence, sans qu'aucun
 * contrôle existant ne le détecte.
 *
 * ⚠️ Différence assumée avec `seed-merge-subscription-campaigns` (rapatriement du 10/08) : celui-ci
 * filtrait les lignes sur leur **prix unitaire**, parce qu'il fusionnait des campagnes de MÊME
 * tarif et devait écarter les intruses. Ici la campagne source est supprimée : y laisser une ligne
 * la rendrait **invisible** (les campagnes supprimées ne sont plus listées). On prend donc TOUTES
 * les lignes de la campagne, et le tarif ne sert qu'à choisir la destination.
 *
 * ── Garde-fous ───────────────────────────────────────────────────────────────────────────────
 * 1. **SIMULATION par défaut** : sans `--apply`, rien n'est écrit et tout est listé.
 * 2. Les deux destinations sont vérifiées avant tout (existent, vivantes, bon tarif) ; la campagne
 *    en cours doit être **unique** - deux campagnes `started` au plein tarif arrêtent le script
 *    plutôt que de choisir à la place de l'utilisateur.
 * 3. **Refus si un paiement ne pointe pas la campagne de sa ligne** : les deux tables divergent
 *    déjà, il faut comprendre pourquoi avant de déplacer quoi que ce soit.
 * 4. **Refus si le quota d'une destination serait dépassé** pour un bénéficiaire.
 * 5. **`updated_at` préservée** sur les lignes et les paiements (`updated_at = updated_at`) :
 *    l'argent n'a pas bougé. Sans cette affectation explicite, le `ON UPDATE CURRENT_TIMESTAMP(6)`
 *    ferait annoncer « modifié aujourd'hui » à la console d'assistance sur des paiements clos.
 * 6. **Fichier de retour arrière** écrit AVANT toute écriture (`backups/`).
 * 7. Idempotent : au second passage, plus aucune campagne source n'est vivante, rien à faire.
 *
 * ── Exécution (depuis api/) ──────────────────────────────────────────────────────────────────
 *   npm run seed:cleanup-subscription-campaigns             # simulation, n'écrit rien
 *   npm run seed:cleanup-subscription-campaigns -- --apply  # applique réellement
 *
 * 🪤 `npm run <seed> --apply` n'applique RIEN : npm consomme `--apply` comme un de ses propres
 * drapeaux et il n'atteint jamais `process.argv`. Le double tiret est obligatoire.
 */

const APPLY = process.argv.includes('--apply');

/** Plein tarif d'un abonnement. En dessous, c'est un essai. */
const PLEIN_TARIF = 15000;

/**
 * Campagne de test : le réceptacle des essais (règle B). **Choix humain, non déductible** - c'est
 * la campagne qui a servi de référence aux essais du 25/07 et à la reconstitution du 11/08.
 * « CAMPAGNE LE SERMENT DU BONHEUR 2027 », 100 XOF, terminée.
 */
const CAMPAGNE_TEST = '7a74c65c-8818-11f1-b125-fa6201c9ffe9';

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

/** Un lot = une destination et les campagnes qu'on y verse. */
type Lot = {
  regle: 'A' | 'B';
  intitule: string;
  cible: Campagne;
  sources: Campagne[];
  lignes: Ligne[];
};

const placeholders = (n: number) => Array(n).fill('?').join(', ');

const fr = (n: number) => n.toLocaleString('fr-FR');

const echec = (message: string): never => {
  console.error(`\n❌ ${message}`);
  console.error("   Rien n'a été écrit.");
  process.exit(2);
};

async function run() {
  const ds = await AppDataSource.initialize();

  console.log(`\n[ménage campagnes] Base cible : ${ds.options.database as string}`);
  console.log(
    APPLY
      ? '[ménage campagnes] Mode : APPLICATION (les données seront modifiées)'
      : '[ménage campagnes] Mode : SIMULATION (aucune écriture - relancer avec « -- --apply »)',
  );

  const colonnes = `id, uuid, name, amount, status, max_payments_per_beneficiary, deleted_at`;

  try {
    // ── 1. Les deux destinations ────────────────────────────────────────────────────────────
    const enCours: Campagne[] = await ds.query(
      `SELECT ${colonnes} FROM subscriptions
        WHERE amount = ? AND status = 'started' AND deleted_at IS NULL`,
      [PLEIN_TARIF],
    );
    if (enCours.length === 0) {
      echec(
        `Aucune campagne à ${fr(PLEIN_TARIF)} XOF en cours (statut « started ») : la `
        + 'destination de la règle A est introuvable.',
      );
    }
    if (enCours.length > 1) {
      echec(
        `${enCours.length} campagnes à ${fr(PLEIN_TARIF)} XOF sont « started » : `
        + `${enCours.map((c) => `#${c.id} ${c.name}`).join(', ')}. Le script ne choisit pas à `
        + 'votre place - clôturez celles qui ne sont plus la campagne en cours.',
      );
    }
    const cibleA = enCours[0];

    const [cibleB]: Campagne[] = await ds.query(
      `SELECT ${colonnes} FROM subscriptions WHERE uuid = ?`,
      [CAMPAGNE_TEST],
    );
    if (!cibleB) echec(`Campagne de test introuvable (uuid ${CAMPAGNE_TEST}). Mauvaise base ?`);
    if (cibleB.deleted_at !== null) echec(`La campagne de test « ${cibleB.name} » est supprimée.`);
    if (Number(cibleB.amount) >= PLEIN_TARIF) {
      echec(
        `La campagne de test « ${cibleB.name} » est à ${fr(Number(cibleB.amount))} XOF : `
        + `ce n'est pas une campagne d'essai. Vérifier CAMPAGNE_TEST.`,
      );
    }

    console.log(`\nCampagne en cours (règle A) : #${cibleA.id} « ${cibleA.name} »`);
    console.log(`  ${fr(Number(cibleA.amount))} XOF · ${cibleA.status} · quota ${cibleA.max_payments_per_beneficiary ?? '(aucun)'}`);
    console.log(`Campagne de test  (règle B) : #${cibleB.id} « ${cibleB.name} »`);
    console.log(`  ${fr(Number(cibleB.amount))} XOF · ${cibleB.status} · quota ${cibleB.max_payments_per_beneficiary ?? '(aucun)'}`);

    // ── 2. Les campagnes sources ────────────────────────────────────────────────────────────
    const sourcesA: Campagne[] = await ds.query(
      `SELECT ${colonnes} FROM subscriptions
        WHERE amount = ? AND status = 'archived' AND deleted_at IS NULL AND uuid <> ?
        ORDER BY id`,
      [PLEIN_TARIF, cibleA.uuid],
    );
    const sourcesB: Campagne[] = await ds.query(
      `SELECT ${colonnes} FROM subscriptions
        WHERE amount < ? AND deleted_at IS NULL AND uuid <> ?
        ORDER BY id`,
      [PLEIN_TARIF, cibleB.uuid],
    );

    const chargerLignes = async (sources: Campagne[]): Promise<Ligne[]> => {
      if (sources.length === 0) return [];
      return ds.query(
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
    };

    const lots: Lot[] = [
      {
        regle: 'A',
        intitule: `campagnes ARCHIVÉES à ${fr(PLEIN_TARIF)} XOF → campagne en cours`,
        cible: cibleA,
        sources: sourcesA,
        lignes: await chargerLignes(sourcesA),
      },
      {
        regle: 'B',
        intitule: `campagnes SOUS ${fr(PLEIN_TARIF)} XOF → campagne de test`,
        cible: cibleB,
        sources: sourcesB,
        lignes: await chargerLignes(sourcesB),
      },
    ];

    if (lots.every((l) => l.sources.length === 0)) {
      console.log('\nAucune campagne à traiter. Rien à faire.');
      return;
    }

    // ── 3. Le détail, lot par lot ───────────────────────────────────────────────────────────
    for (const lot of lots) {
      console.log(`\n══ Règle ${lot.regle} - ${lot.intitule} ══`);
      if (lot.sources.length === 0) {
        console.log('   Aucune campagne concernée.');
        continue;
      }
      for (const s of lot.sources) {
        const lignes = lot.lignes.filter((l) => l.campagne_uuid === s.uuid);
        const encaisse = lignes
          .filter((l) => l.payment_status === 'paid')
          .reduce((n, l) => n + Number(l.amount), 0);
        console.log(
          `\n   #${s.id} « ${s.name} » (${fr(Number(s.amount))} XOF · ${s.status})`
          + `\n      ${lignes.length} ligne(s)`
          + (encaisse > 0 ? ` · ${fr(encaisse)} XOF encaissés` : '')
          + ' → suppression logique après reclassement',
        );
        const parStatut = new Map<string, number>();
        for (const l of lignes) {
          const cle = `ligne=${l.status} argent=${l.payment_status ?? '(aucun)'}`;
          parStatut.set(cle, (parStatut.get(cle) ?? 0) + 1);
        }
        for (const [cle, n] of parStatut) console.log(`         ${n} × ${cle}`);
      }
    }

    // ── 4. Garde-fou : cohérence paiement ↔ abonnement AVANT de bouger ─────────────────────
    const divergents = lots
      .flatMap((l) => l.lignes)
      .filter((l) => l.payment_uuid && l.payment_source_uuid !== l.campagne_uuid);
    if (divergents.length > 0) {
      console.error(`\n${divergents.length} paiement(s) ne pointent pas la campagne de leur ligne :`);
      for (const l of divergents) {
        console.error(
          `   ${l.beneficiary_name} : paiement → ${l.payment_source_uuid}, ligne → ${l.campagne_uuid}`,
        );
      }
      echec('Les deux tables divergent déjà. Comprendre pourquoi avant tout déplacement.');
    }

    // ── 5. Garde-fou : le quota de chaque destination ───────────────────────────────────────
    for (const lot of lots) {
      const quota = lot.cible.max_payments_per_beneficiary;
      if (quota === null || lot.lignes.length === 0) continue;

      const dejaSurCible: { beneficiary_uuid: string; unites: string }[] = await ds.query(
        `SELECT beneficiary_uuid, SUM(quantity) AS unites
           FROM subscription_payments
          WHERE subscription_uuid = ? AND status = 'success'
          GROUP BY beneficiary_uuid`,
        [lot.cible.uuid],
      );
      const compteur = new Map<string, number>();
      for (const r of dejaSurCible) compteur.set(r.beneficiary_uuid, Number(r.unites));
      for (const l of lot.lignes.filter((x) => x.status === 'success')) {
        compteur.set(l.beneficiary_uuid, (compteur.get(l.beneficiary_uuid) ?? 0) + Number(l.quantity));
      }

      const depassements = new Set(
        lot.lignes
          .filter((l) => (compteur.get(l.beneficiary_uuid) ?? 0) > quota)
          .map((l) => `${l.beneficiary_name} : ${compteur.get(l.beneficiary_uuid)} unités`),
      );
      if (depassements.size > 0) {
        console.error(`\nRègle ${lot.regle} - le quota de ${quota} unité(s) par bénéficiaire serait dépassé :`);
        for (const d of depassements) console.error(`   ${d}`);
        echec(`Reclasser ces lignes rendrait « ${lot.cible.name} » incohérente avec son propre quota.`);
      }

      const maxApres = Math.max(0, ...lot.lignes.map((l) => compteur.get(l.beneficiary_uuid) ?? 0));
      console.log(
        `\nRègle ${lot.regle} - quota : ${maxApres} unité(s) au maximum par bénéficiaire après `
        + `reclassement (limite ${quota}). ✅`,
      );
    }

    // ── 6. Récapitulatif ────────────────────────────────────────────────────────────────────
    const toutesLignes = lots.flatMap((l) => l.lignes);
    const toutesSources = lots.flatMap((l) => l.sources);
    const encaisseTotal = toutesLignes
      .filter((l) => l.payment_status === 'paid')
      .reduce((n, l) => n + Number(l.amount), 0);

    console.log('\n──────────────────────────────────────────────');
    console.log(`Lignes d'abonnement à reclasser : ${toutesLignes.length}`);
    console.log(`Paiements à repointer           : ${toutesLignes.filter((l) => l.payment_uuid).length}`);
    console.log(`Dont déjà encaissés             : ${fr(encaisseTotal)} XOF`);
    console.log(`Campagnes à supprimer           : ${toutesSources.length}`);

    if (!APPLY) {
      console.log('\nSimulation terminée - aucune écriture.');
      console.log('Pour appliquer : npm run seed:cleanup-subscription-campaigns -- --apply');
      return;
    }

    // ── 7. Retour arrière, écrit AVANT la moindre écriture ──────────────────────────────────
    const dossier = join(process.cwd(), 'backups');
    mkdirSync(dossier, { recursive: true });
    const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
    const fichier = join(dossier, `rollback-menage-campagnes-${horodatage}.sql`);

    const sql = [
      "-- Retour arrière du ménage des campagnes d'abonnement",
      `-- Base : ${ds.options.database as string}`,
      `-- Généré le ${new Date().toISOString()}`,
      '-- ⚠️ À rejouer TEL QUEL et EN ENTIER : les trois blocs sont solidaires.',
      'START TRANSACTION;',
      ...toutesLignes.map(
        (l) =>
          `UPDATE subscription_payments SET subscription_uuid = '${l.campagne_uuid}', `
          + `updated_at = updated_at WHERE uuid = '${l.uuid}';`,
      ),
      ...toutesLignes
        .filter((l) => l.payment_uuid)
        .map(
          (l) =>
            `UPDATE payments SET source_uuid = '${l.payment_source_uuid}', `
            + `updated_at = updated_at WHERE uuid = '${l.payment_uuid}';`,
        ),
      ...toutesSources.map(
        (s) => `UPDATE subscriptions SET deleted_at = NULL WHERE uuid = '${s.uuid}';`,
      ),
      'COMMIT;',
      '',
    ].join('\n');

    writeFileSync(fichier, sql, 'utf8');
    console.log(`\n💾 Retour arrière écrit : ${fichier}`);

    // ── 8. L'écriture, en UNE transaction pour les deux règles ──────────────────────────────
    await ds.transaction(async (m) => {
      for (const lot of lots) {
        if (lot.lignes.length > 0) {
          // `updated_at = updated_at` neutralise le ON UPDATE CURRENT_TIMESTAMP(6) : l'argent n'a
          // pas bougé, seul son rattachement.
          const rLignes = await m.query(
            `UPDATE subscription_payments
                SET subscription_uuid = ?, updated_at = updated_at
              WHERE uuid IN (${placeholders(lot.lignes.length)})`,
            [lot.cible.uuid, ...lot.lignes.map((l) => l.uuid)],
          );
          if (rLignes.affectedRows !== lot.lignes.length) {
            throw new Error(
              `Règle ${lot.regle} : ${rLignes.affectedRows} ligne(s) mise(s) à jour au lieu de `
              + `${lot.lignes.length} - transaction annulée.`,
            );
          }

          const paiements = lot.lignes.map((l) => l.payment_uuid).filter((u): u is string => !!u);
          if (paiements.length > 0) {
            const rPaiements = await m.query(
              `UPDATE payments
                  SET source_uuid = ?, updated_at = updated_at
                WHERE uuid IN (${placeholders(paiements.length)}) AND source = 'subscription'`,
              [lot.cible.uuid, ...paiements],
            );
            if (rPaiements.affectedRows !== paiements.length) {
              throw new Error(
                `Règle ${lot.regle} : ${rPaiements.affectedRows} paiement(s) repointé(s) au lieu `
                + `de ${paiements.length} - transaction annulée.`,
              );
            }
          }
        }

        if (lot.sources.length > 0) {
          // Suppression LOGIQUE : convention du projet (DateTimeEntity), retour arrière possible.
          // `updated_at` bouge ici, c'est normal : la campagne, elle, a bien changé d'état.
          const rCampagnes = await m.query(
            `UPDATE subscriptions
                SET deleted_at = CURRENT_TIMESTAMP(6)
              WHERE uuid IN (${placeholders(lot.sources.length)}) AND deleted_at IS NULL`,
            lot.sources.map((s) => s.uuid),
          );
          if (rCampagnes.affectedRows !== lot.sources.length) {
            throw new Error(
              `Règle ${lot.regle} : ${rCampagnes.affectedRows} campagne(s) supprimée(s) au lieu `
              + `de ${lot.sources.length} - transaction annulée.`,
            );
          }
        }
      }
    });

    console.log('\n✅ Ménage appliqué.');

    // ── 9. Contrôles après écriture ─────────────────────────────────────────────────────────
    for (const lot of lots) {
      const [apres]: { lignes: string; succes: string | null; encaisse: string | null }[] =
        await ds.query(
          `SELECT COUNT(*) AS lignes,
                  SUM(status = 'success') AS succes,
                  SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END) AS encaisse
             FROM subscription_payments WHERE subscription_uuid = ?`,
          [lot.cible.uuid],
        );
      console.log(
        `\n  « ${lot.cible.name} » : ${apres.lignes} lignes, ${apres.succes ?? 0} payées, `
        + `${fr(Number(apres.encaisse ?? 0))} XOF`,
      );
    }

    const [restes]: { n: string }[] = await ds.query(
      `SELECT COUNT(*) AS n FROM subscription_payments
        WHERE subscription_uuid IN (${placeholders(toutesSources.length)})`,
      toutesSources.map((s) => s.uuid),
    );
    // Un paiement pointant une campagne supprimée serait de l'argent INVISIBLE à l'écran (les
    // campagnes supprimées ne sont plus listées) : c'est le contrôle qui compte le plus ici.
    const [orphelins]: { n: string }[] = await ds.query(
      `SELECT COUNT(*) AS n FROM payments p
         LEFT JOIN subscriptions s ON s.uuid = p.source_uuid AND s.deleted_at IS NULL
        WHERE p.source = 'subscription' AND s.uuid IS NULL`,
    );
    const [divergence]: { n: string }[] = await ds.query(
      `SELECT COUNT(*) AS n
         FROM subscription_payments sp
         JOIN payments p ON p.uuid = sp.payment_uuid
        WHERE p.source_uuid <> sp.subscription_uuid`,
    );

    console.log('\nContrôles :');
    console.log(`  restant sur les campagnes supprimées : ${restes.n} ligne(s) (attendu 0)`);
    console.log(`  paiements sur campagne supprimée     : ${orphelins.n} (attendu 0)`);
    console.log(`  paiement ↔ abonnement                : ${divergence.n} divergence(s) (attendu 0)`);
    console.log(`  campagnes supprimées                 : ${toutesSources.length}`);

    if (Number(restes.n) > 0 || Number(orphelins.n) > 0 || Number(divergence.n) > 0) {
      console.error('\n⚠️  Un contrôle est en échec.');
      console.error(`   Retour arrière disponible : ${fichier}`);
      process.exit(1);
    }
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[ménage campagnes] Échec :', err);
  process.exit(1);
});
