/**
 * Balayage planifié des distributions du journal (cron).
 *
 *  - Marque « en retard » les zones non livrées dont la DATE LIMITE est dépassée ;
 *  - Relance (J+1) les responsables des zones notifiées non livrées (SMS/WhatsApp
 *    via le provider TextO - en simulation tant que LeTexto n'est pas branché),
 *    max 2 relances par zone.
 *
 * Démarre un contexte NestJS autonome (sans serveur HTTP), exécute le balayage
 * sur TOUTES les éditions, puis se termine. Acteur tracé = « SYSTÈME (planifié) ».
 *
 * Build : `npm run build`  →  dist/journals/journal-sweep.cli.js
 * Lancement manuel :
 *   node dist/journals/journal-sweep.cli.js
 * Cron quotidien (06:00) - crontab -e :
 *   0 6 * * * cd /chemin/vers/soka_api && node dist/journals/journal-sweep.cli.js >> /var/log/journal-sweep.log 2>&1
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { JournalDistributionService } from './journal-distribution.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const service = app.get(JournalDistributionService);
    // Pas d'admin_uuid => exécution SYSTÈME ; pas d'edition_uuid => toutes les éditions.
    const res = await service.sweepLateAndRemind();
    // eslint-disable-next-line no-console
    console.log(
      `[journal-sweep] ${new Date().toISOString()} - traitees=${res.processed}, en_retard=${res.late}, relancees=${res.reminded}`,
    );
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('[journal-sweep] échec :', e);
    process.exit(1);
  });
