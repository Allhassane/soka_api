import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SchedulerRegistry } from '@nestjs/schedule';
import { AppModule } from '../app.module';
import { PaymentService } from '../payments/payment.service';

/**
 * Déclenche **un passage** de la synchronisation des paiements en attente, à la demande.
 *
 * Le cron (`HubPaymentSyncCronService`) tourne toutes les 10 minutes **dans le processus de
 * l'API** : après un `pm2 restart`, il faut donc attendre la prochaine tranche pour voir
 * l'effet d'un déploiement. Ce script fait ce passage tout de suite - typiquement pour
 * constater, juste après une mise en production, que les encaissements en retard sont bien
 * crédités, sans attendre.
 *
 * ⚠️ **Il n'y a AUCUNE logique de synchronisation ici.** Il appelle
 * `PaymentService.syncAllPendingHubPayments()`, exactement la méthode du cron. Réécrire le
 * balayage dans un script en ferait une seconde route vers le même argent - la duplication
 * qui a produit les écarts qu'on vient de corriger.
 *
 * ⚠️ **Ce script ÉCRIT** (c'est son objet) : il crédite les paiements que le guichet déclare
 * encaissés, referme ceux qu'il déclare échoués, et désactive les liens des tentatives
 * abandonnées. Pour seulement *regarder*, utiliser `npm run seed:reconcile-hub-payments`,
 * qui est en lecture stricte.
 *
 * ⚠️ Il démarre l'application complète, donc **les migrations en attente s'appliquent**
 * (`app.module.ts` → `migrationsRun: true`) - exactement comme un redémarrage de l'API. Ne
 * pas le lancer sur un dépôt dont le code n'est pas celui qu'on veut déployer.
 *
 * Exécution (depuis api/) :
 *   npm run seed:sync-hub-payments
 */

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  /**
   * Désarme les tâches planifiées de CE contexte. Sans ça, le script laisserait un cron armé
   * derrière lui et pourrait lancer un second balayage concurrent de celui de l'API : le
   * garde `isRunning` est propre à un processus, il ne protège pas d'un autre.
   */
  const scheduler = app.get(SchedulerRegistry);
  for (const [nom, job] of scheduler.getCronJobs()) {
    job.stop();
    scheduler.deleteCronJob(nom);
  }

  const payments = app.get(PaymentService);

  console.log('\nSynchronisation des paiements en attente (un passage)…\n');
  const debut = Date.now();
  const r = await payments.syncAllPendingHubPayments();
  const secondes = Math.round((Date.now() - debut) / 1000);

  console.log(`Terminé en ${secondes} s.`);
  console.log(`  traités                  : ${r.processed}`);
  console.log(`  crédités (encaissés)     : ${r.paid}`);
  console.log(`  refermés (échec constaté): ${r.failed}`);
  console.log(`  abandons refermés        : ${r.abandoned}`);
  console.log(`  toujours en attente      : ${r.pending}`);
  console.log(`  erreurs                  : ${r.errors}`);

  if (r.errors > 0) {
    console.log(
      `\n⚠️  ${r.errors} interrogation(s) en échec : le guichet n'a pas répondu pour `
      + `celles-là. Rien n'a été refermé sur ces lignes - relancer pour les reprendre.`,
    );
  }
  console.log(
    `\nContrôler le résultat avec : npm run seed:reconcile-hub-payments (doit rendre 0).`,
  );

  await app.close();
  process.exit(r.errors > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
