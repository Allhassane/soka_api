import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppModule } from '../app.module';
import { PaymentService } from '../payments/payment.service';

/**
 * **Rattrape l'opérateur et le motif d'échec des paiements antérieurs** aux colonnes
 * ajoutées par la migration `AddHubPaymentDetails1782903000000`.
 *
 * Depuis cette migration, chaque vérification au guichet conserve `provider`,
 * `failure_code`, `failure_message` et `paid_at`. Les paiements plus anciens, eux, sont
 * restés à NULL : sans ce rattrapage, les statistiques « par opérateur » et « motifs
 * d'échec » ne porteraient que sur les paiements postérieurs au déploiement.
 *
 * 🚨 **Ce script ne modifie AUCUN statut de paiement.** Il ne crédite rien, ne referme
 * rien, n'annule aucun lien. Il lit le guichet (`checkPaymentStatus` est un GET) et
 * n'écrit que les quatre colonnes d'analyse. C'est délibérément un chemin distinct de
 * `seed:sync-hub-payments`, qui lui touche à l'argent.
 *
 * ⚠️ **SIMULATION par défaut.** Le guichet est interrogé, la base n'est pas touchée.
 * Écrire exige `-- --apply`.
 *
 * 🪤 **`npm run <seed> --apply` n'applique RIEN** : npm consomme `--apply` comme un de ses
 * propres drapeaux et il n'atteint jamais `process.argv`. Le double tiret est obligatoire.
 *
 * ⚠️ Il démarre l'application complète, donc **les migrations en attente s'appliquent**.
 *
 * ⚠️ Un appel réseau par paiement (par lots de 5). Sur ~1 800 lignes, compter quelques
 * minutes. Le script est **reprenable** : seules les lignes sans opérateur sont candidates.
 *
 * Exécution (depuis api/) :
 *   npm run seed:backfill-hub-details                          # simulation, tout le stock
 *   npm run seed:backfill-hub-details -- --limit=20            # simulation sur 20 lignes
 *   npm run seed:backfill-hub-details -- --apply               # écrit
 */

async function main() {
  const apply = process.argv.includes('--apply');

  // Un premier passage borné permet de vérifier la chaîne complète sans lancer des
  // milliers d'appels au guichet.
  //
  // ⚠️ Les DEUX formes sont acceptées (`--limit=20` et `--limit 20`), et la validation porte
  // sur la PRÉSENCE du drapeau, jamais sur celle du motif `--limit=`. Une version antérieure
  // ne reconnaissait que la forme avec `=` : `--limit 20 --apply` passait sans un mot, retombait
  // sur le défaut de 5 000 et interrogeait TOUT le stock au guichet de production — l'inverse
  // exact de ce que l'opérateur demandait. Le piège était d'autant plus sûr que les formes
  // fautives explicites, elles, étaient bien rejetées : on en déduisait que le drapeau était contrôlé.
  const iLimit = process.argv.indexOf('--limit');
  const limitArg = iLimit !== -1
    ? process.argv[iLimit + 1]
    : process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
  const limiteDemandee = process.argv.some((a) => a === '--limit' || a.startsWith('--limit='));

  const limit = limitArg !== undefined ? Number(limitArg) : undefined;
  if (limiteDemandee && (!Number.isFinite(limit) || limit! <= 0 || !Number.isInteger(limit))) {
    console.error(
      `--limit invalide : ${limitArg ?? '(valeur absente)'}. Attendu : un entier > 0, `
      + `sous la forme --limit=20 ou --limit 20.`,
    );
    process.exit(2);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Même précaution que `seed:sync-hub-payments` : ne pas laisser un cron armé dans ce
  // contexte lancer un balayage concurrent de celui de l'API pendant que le script tourne.
  const scheduler = app.get(SchedulerRegistry);
  for (const [nom, job] of scheduler.getCronJobs()) {
    job.stop();
    scheduler.deleteCronJob(nom);
  }

  const payments = app.get(PaymentService);

  console.log(
    `\nRattrapage du détail guichet - ${apply ? 'ÉCRITURE' : 'SIMULATION (rien ne sera écrit)'}\n`,
  );

  const debut = Date.now();
  const r = await payments.backfillHubPaymentDetails(
    limit === undefined ? { apply } : { apply, limit },
  );
  const secondes = Math.round((Date.now() - debut) / 1000);

  console.log(`Terminé en ${secondes} s.`);
  console.log(`  candidats (sans opérateur) : ${r.candidats}`);
  console.log(`  interrogés au guichet      : ${r.interroges}`);
  console.log(`  ${apply ? 'renseignés' : 'renseignables'}${apply ? '                 ' : '              '}: ${r.renseignes}`);
  console.log(`  sans tentative au guichet  : ${r.sans_detail}`);
  console.log(`  erreurs                    : ${r.erreurs}`);

  if (r.sans_detail > 0) {
    console.log(
      `\n${r.sans_detail} paiement(s) restent sans opérateur : le guichet ne connaît aucune `
      + `tentative sur ces liens (le membre a ouvert la page sans rien engager). Ils resteront `
      + `candidats aux prochaines exécutions - c'est normal, pas une erreur.`,
    );
  }

  if (r.erreurs > 0) {
    console.log(
      `\n⚠️  ${r.erreurs} interrogation(s) en échec. Rien n'a été écrit sur ces lignes - `
      + `relancer le script les reprendra.`,
    );
  }

  if (!apply && r.renseignes > 0) {
    console.log(`\nPour écrire : npm run seed:backfill-hub-details -- --apply`);
  }

  await app.close();
  process.exit(r.erreurs > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
