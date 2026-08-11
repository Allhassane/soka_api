import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { HubService } from '../payments/hub.service';

/**
 * RESTAURATION - Réintroduit en base les paiements présents dans un dump antérieur et absents
 * de la base courante, avec leurs lignes d'abonnement et les campagnes qu'ils référencent.
 *
 * **Le constat qui motive ce script.** Toute l'histoire antérieure au 31/07 14:40 a été purgée
 * de la production : 847 paiements et 8 campagnes de la phase d'essai. Or le guichet, lui, a
 * bien encaissé une partie de cet argent - c'est le reliquat de **30 301 XOF** que le
 * rapprochement du 09/08 avait laissé ouvert, et le seul écart que la concordance affiche encore.
 *
 * 🚨 **Ce script ne crédite RIEN à la main.** Il réintroduit les lignes **telles qu'elles
 * étaient**, statut compris. Les paiements encaissés au guichet mais restés `pending` sont
 * recrédités par le **cron de synchronisation**, sur le chemin déjà éprouvé : une seconde route
 * vers le même argent finirait par diverger (c'est la cause exacte des écarts de début août).
 *
 * ── Ce qui est restauré ──────────────────────────────────────────────────────────────────
 * `--scope=monetaire` (défaut) : **uniquement les paiements que le guichet confirme encaissés**.
 *   C'est le périmètre défendable : de l'argent réellement encaissé, absent de l'application.
 * `--scope=historique` : toutes les tentatives que le guichet connaît (encaissées ou non), pour
 *   retrouver la chronologie d'essai.
 *   ⚠️ Dans ce mode, une tentative en attente et NON encaissée est restaurée **en `cancelled`**,
 *   jamais en `pending` : la réintroduire en attente recréerait le blocage refermé le 07/08
 *   (une ligne `init`/`pending` interdit tout nouveau paiement au couple campagne + bénéficiaire).
 *
 * ⚠️ **Le `sandbox` n'est JAMAIS restauré**, dans aucun mode. 24 lignes, 405 000 XOF de monnaie
 * de test : les injecter ferait exploser la concordance que ce chantier vise précisément à
 * fermer. Le filtre est structurel - la liste marchande du guichet de production ne rend que le
 * `live`, donc une ligne inconnue d'elle n'est jamais reprise.
 *
 * ── Prérequis ────────────────────────────────────────────────────────────────────────────
 * Le dump source doit être chargé dans un **schéma du même serveur MySQL** (tables `payments`,
 * `subscription_payments`, `subscriptions`), passé par `--source=<schéma>`.
 *
 * ── Exécution (depuis api/) ──────────────────────────────────────────────────────────────
 *   npm run seed:restore-deleted-payments                              # simulation
 *   npm run seed:restore-deleted-payments -- --scope=historique        # simulation, tout le live
 *   npm run seed:restore-deleted-payments -- --apply                   # écrit
 *
 * 🪤 Le double tiret est obligatoire : npm consomme `--apply` comme un de ses propres drapeaux.
 */

const APPLY = process.argv.includes('--apply');

const lireOption = (nom: string, defaut: string): string => {
  const i = process.argv.indexOf(`--${nom}`);
  if (i !== -1 && process.argv[i + 1]) return process.argv[i + 1];
  const inline = process.argv.find((a) => a.startsWith(`--${nom}=`));
  return inline ? inline.split('=').slice(1).join('=') : defaut;
};

const SOURCE = lireOption('source', 'soka_dump0108');
const SCOPE = lireOption('scope', 'monetaire');

type Candidat = {
  uuid: string;
  transaction_id: string;
  source_uuid: string;
  payment_status: string;
  total_amount: string;
};

/** Colonnes communes aux deux schémas : le dump est antérieur aux colonnes d'analyse. */
async function colonnesCommunes(ds: DataSource, table: string, source: string): Promise<string[]> {
  const r: { c: string }[] = await ds.query(
    `SELECT a.COLUMN_NAME AS c
       FROM information_schema.COLUMNS a
       JOIN information_schema.COLUMNS b
         ON b.TABLE_SCHEMA = ? AND b.TABLE_NAME = a.TABLE_NAME AND b.COLUMN_NAME = a.COLUMN_NAME
      WHERE a.TABLE_SCHEMA = DATABASE() AND a.TABLE_NAME = ?
      ORDER BY a.ORDINAL_POSITION`,
    [source, table],
  );
  return r.map((x) => x.c);
}

async function main() {
  if (!['monetaire', 'historique'].includes(SCOPE)) {
    console.error(`--scope invalide : ${SCOPE}. Attendu : monetaire | historique.`);
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });

  // Même précaution que les autres seeds : pas de cron armé dans ce contexte pendant qu'on écrit.
  const scheduler = app.get(SchedulerRegistry);
  for (const [nom, job] of scheduler.getCronJobs()) {
    job.stop();
    scheduler.deleteCronJob(nom);
  }

  const ds = app.get(DataSource);
  const hub = app.get(HubService);

  try {
    console.log(`\n[restauration] Base : ${ds.options.database as string} · source : ${SOURCE}`);
    console.log(`[restauration] Périmètre : ${SCOPE}`);
    console.log(
      APPLY
        ? '[restauration] Mode : APPLICATION'
        : '[restauration] Mode : SIMULATION (relancer avec « -- --apply »)',
    );

    const existe = await ds.query(
      `SELECT COUNT(*) n FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('payments','subscription_payments','subscriptions')`,
      [SOURCE],
    );
    if (Number(existe[0].n) < 3) {
      console.error(
        `\n❌ Le schéma « ${SOURCE} » ne porte pas les trois tables attendues `
        + `(payments, subscription_payments, subscriptions). Charger le dump d'abord.`,
      );
      process.exit(2);
    }

    // ── 1. Les candidats : présents à la source, absents ici ────────────────────────────
    const candidats: Candidat[] = await ds.query(
      `SELECT d.uuid, d.transaction_id, d.source_uuid, d.payment_status, d.total_amount
         FROM \`${SOURCE}\`.payments d
        WHERE NOT EXISTS (SELECT 1 FROM payments p WHERE p.uuid = d.uuid)`,
    );
    console.log(`\nPaiements absents de la base : ${candidats.length}`);
    if (candidats.length === 0) {
      console.log('Rien à restaurer.');
      return;
    }

    // ── 2. Ce que le guichet connaît réellement ─────────────────────────────────────────
    // Une seule lecture paginée : elle donne le statut de chaque tentative ET son lien.
    console.log('Lecture du guichet (liste marchande, lecture seule)…');
    const { payments: transactions, complet } = await hub.listGatewayPayments({});
    if (!complet) {
      console.error('\n❌ Lecture du guichet TRONQUÉE : restaurer sur cette base serait arbitraire.');
      process.exit(2);
    }

    // 🚨 L'exclusion du sandbox est PORTÉE PAR CE FILTRE, pas par la clé marchande. La croyance
    // « la clé de prod ne voit que le live » était FAUSSE : mesuré le 2026-08-11, la liste
    // marchande mélangeait les environnements et ce seed a restauré 45 000 XOF d'essais
    // sandbox comme du vrai argent. Le guichet filtre désormais côté serveur ET expose
    // `environment` ; ce seed refuse de tourner contre un guichet trop ancien pour le rendre.
    if (transactions.length > 0 && transactions.every((t) => t.environment === undefined)) {
      console.error(
        '\n❌ Le guichet ne rend pas l\'environnement des tentatives : déployer d\'abord le'
        + ' correctif SOKA Pay (filtre + exposition d\'`environment` dans la liste marchande).'
        + ' Sans lui, des encaissements SANDBOX passeraient pour du vrai argent.',
      );
      process.exit(2);
    }
    const transactionsLive = transactions.filter((t) => (t.environment ?? 'live') === 'live');
    const horsLive = transactions.length - transactionsLive.length;
    if (horsLive > 0) {
      console.log(`  ⚠️ ${horsLive} tentative(s) hors \`live\` écartée(s) d'office.`);
    }

    const liensEncaisses = new Set(
      transactionsLive.filter((t) => t.status === 'successful').map((t) => t.linkId),
    );
    const liensConnus = new Set(transactionsLive.map((t) => t.linkId));
    console.log(
      `  ${transactionsLive.length} tentatives live · ${liensConnus.size} liens connus · ${liensEncaisses.size} encaissés`,
    );

    // ── 3. Le périmètre ─────────────────────────────────────────────────────────────────
    const retenus = candidats.filter((c) =>
      SCOPE === 'monetaire'
        ? liensEncaisses.has(c.transaction_id)
        : liensConnus.has(c.transaction_id),
    );
    const ecartes = candidats.length - retenus.length;

    // En mode historique, une tentative en attente jamais encaissée revient FERMÉE : la
    // remettre en `pending` rebloquerait son couple campagne + bénéficiaire.
    const aFermer = retenus.filter(
      (c) => c.payment_status === 'pending' && !liensEncaisses.has(c.transaction_id),
    );

    const encaissesRestesEnAttente = retenus.filter(
      (c) => c.payment_status === 'pending' && liensEncaisses.has(c.transaction_id),
    );
    const dejaPayes = retenus.filter((c) => c.payment_status === 'paid');
    const montantPayes = dejaPayes.reduce((n, c) => n + Number(c.total_amount), 0);
    const montantEnAttente = encaissesRestesEnAttente.reduce((n, c) => n + Number(c.total_amount), 0);

    console.log(`\n── Périmètre retenu : ${retenus.length} paiement(s) ───────────────`);
    console.log(`  déjà « payés » dans le dump      : ${dejaPayes.length} (${montantPayes.toLocaleString('fr-FR')} XOF)`);
    console.log(`  encaissés mais restés en attente : ${encaissesRestesEnAttente.length} (${montantEnAttente.toLocaleString('fr-FR')} XOF)`);
    console.log(`     → recrédités par le CRON, jamais par ce script`);
    if (SCOPE === 'historique') {
      console.log(`  restaurés fermés (jamais encaissés) : ${aFermer.length}`);
    }
    console.log(`  écartés (sandbox ou inconnus du guichet) : ${ecartes}`);

    if (retenus.length === 0) {
      console.log('\nRien à restaurer sur ce périmètre.');
      return;
    }

    const uuids = retenus.map((c) => c.uuid);
    const placeholders = (n: number) => Array(n).fill('?').join(',');

    // ── 4. Les campagnes manquantes ─────────────────────────────────────────────────────
    const campagnes: { uuid: string; name: string; status: string }[] = await ds.query(
      `SELECT DISTINCT s.uuid, s.name, s.status
         FROM \`${SOURCE}\`.payments d
         JOIN \`${SOURCE}\`.subscriptions s ON s.uuid = d.source_uuid
        WHERE d.uuid IN (${placeholders(uuids.length)})
          AND NOT EXISTS (SELECT 1 FROM subscriptions x WHERE x.uuid = s.uuid)`,
      uuids,
    );
    console.log(`\n── ${campagnes.length} campagne(s) à restaurer ─────────────────────`);
    for (const c of campagnes) console.log(`     « ${c.name} » (${c.status})`);
    if (campagnes.length > 0) {
      console.log(
        `  ⚠️ Sans elles, les paiements restaurés pointeraient une campagne inexistante.\n`
        + `     Elles sont archivées/terminées : les listes filtrant sur « started » par défaut,\n`
        + `     elles n'apparaîtront pas dans l'interface.`,
      );
    }

    // ── 5. Les lignes d'abonnement ──────────────────────────────────────────────────────
    const [{ n: nbLignes }]: { n: string }[] = await ds.query(
      `SELECT COUNT(*) n FROM \`${SOURCE}\`.subscription_payments sp
        WHERE sp.payment_uuid IN (${placeholders(uuids.length)})
          AND NOT EXISTS (SELECT 1 FROM subscription_payments x WHERE x.uuid = sp.uuid)`,
      uuids,
    );
    console.log(`\nLignes d'abonnement à restaurer : ${nbLignes}`);
    const sansLigne = retenus.length - Number(nbLignes);
    if (sansLigne > 0) {
      console.log(
        `  ⚠️ ${sansLigne} paiement(s) sans ligne d'abonnement dans le dump : restaurés seuls,\n`
        + `     ils compteront dans la concordance mais pas dans les recettes d'une campagne.`,
      );
    }

    if (!APPLY) {
      console.log('\nSimulation terminée - aucune écriture.');
      console.log('Pour appliquer : npm run seed:restore-deleted-payments -- --apply'
        + (SCOPE === 'historique' ? ' --scope=historique' : ''));
      return;
    }

    // ── 6. Retour arrière, écrit AVANT toute écriture ───────────────────────────────────
    const dossier = join(process.cwd(), 'backups');
    mkdirSync(dossier, { recursive: true });
    const fichier = join(
      dossier,
      `rollback-restauration-paiements-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`,
    );
    writeFileSync(
      fichier,
      [
        `-- Retour arrière de la restauration (${SCOPE}) sur ${ds.options.database as string}`,
        `-- ⚠️ À rejouer EN ENTIER : les trois blocs sont solidaires.`,
        'START TRANSACTION;',
        `DELETE FROM subscription_payments WHERE payment_uuid IN (${uuids.map((u) => `'${u}'`).join(',')});`,
        `DELETE FROM payments WHERE uuid IN (${uuids.map((u) => `'${u}'`).join(',')});`,
        ...campagnes.map((c) => `DELETE FROM subscriptions WHERE uuid = '${c.uuid}';`),
        'COMMIT;',
        '',
      ].join('\n'),
      'utf8',
    );
    console.log(`\n💾 Retour arrière écrit : ${fichier}`);

    // ── 7. L'écriture, en une transaction ───────────────────────────────────────────────
    const colPay = await colonnesCommunes(ds, 'payments', SOURCE);
    const colSub = await colonnesCommunes(ds, 'subscription_payments', SOURCE);
    const colCamp = await colonnesCommunes(ds, 'subscriptions', SOURCE);

    await ds.transaction(async (m) => {
      if (campagnes.length > 0) {
        const liste = campagnes.map((c) => c.uuid);
        await m.query(
          `INSERT INTO subscriptions (${colCamp.map((c) => `\`${c}\``).join(',')})
           SELECT ${colCamp.map((c) => `s.\`${c}\``).join(',')} FROM \`${SOURCE}\`.subscriptions s
            WHERE s.uuid IN (${placeholders(liste.length)})`,
          liste,
        );
      }

      const r = await m.query(
        `INSERT INTO payments (${colPay.map((c) => `\`${c}\``).join(',')})
         SELECT ${colPay.map((c) => `d.\`${c}\``).join(',')} FROM \`${SOURCE}\`.payments d
          WHERE d.uuid IN (${placeholders(uuids.length)})`,
        uuids,
      );
      if (r.affectedRows !== uuids.length) {
        throw new Error(`${r.affectedRows} paiement(s) insérés au lieu de ${uuids.length}.`);
      }

      await m.query(
        `INSERT INTO subscription_payments (${colSub.map((c) => `\`${c}\``).join(',')})
         SELECT ${colSub.map((c) => `sp.\`${c}\``).join(',')} FROM \`${SOURCE}\`.subscription_payments sp
          WHERE sp.payment_uuid IN (${placeholders(uuids.length)})
            AND NOT EXISTS (SELECT 1 FROM subscription_payments x WHERE x.uuid = sp.uuid)`,
        uuids,
      );

      // Mode historique : fermer ce qui n'a jamais été encaissé, plutôt que de rebloquer.
      if (SCOPE === 'historique' && aFermer.length > 0) {
        const fermes = aFermer.map((c) => c.uuid);
        await m.query(
          `UPDATE payments SET payment_status = 'cancelled', status = 'canceled'
            WHERE uuid IN (${placeholders(fermes.length)})`,
          fermes,
        );
        await m.query(
          `UPDATE subscription_payments SET status = 'canceled'
            WHERE payment_uuid IN (${placeholders(fermes.length)})`,
          fermes,
        );
      }
    });

    console.log('\n✅ Restauration appliquée.');
    console.log(
      `  ${retenus.length} paiement(s) · ${nbLignes} ligne(s) d'abonnement · ${campagnes.length} campagne(s)`,
    );
    if (encaissesRestesEnAttente.length > 0) {
      console.log(
        `\n⏳ ${encaissesRestesEnAttente.length} paiement(s) encaissés sont revenus « en attente ».\n`
        + `   Le cron les créditera au prochain passage (10 min), ou tout de suite avec :\n`
        + `   npm run seed:sync-hub-payments`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((e) => {
  console.error('[restauration] Échec :', e);
  process.exit(1);
});
