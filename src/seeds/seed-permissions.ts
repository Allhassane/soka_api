import 'reflect-metadata';
import * as path from 'path';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';
import { listCatalogPermissions } from '../permission/permission-catalog';
import { syncPermissionCatalog } from '../permission/permission-catalog-sync';
import {
  listEnforcedApiSlugs,
  listWebPermissionSlugs,
} from '../permission/permission-code-usage';

/**
 * SEED - Synchronisation de la base sur le catalogue `src/permission/permission-catalog.ts`.
 *
 * ⚠️ Depuis la refonte du 2026-08-01, ce seed est CONVERGENT et NON destructeur :
 *  - il ne purge plus les tables (l'ancienne version remettait RESPONSABLE à « tout coché »
 *    et effaçait la curation manuelle des rôles - c'est terminé) ;
 *  - une ligne `roles_permissions` existante GARDE son statut (elle peut seulement
 *    s'élargir quand une permission absorbée était cochée) ;
 *  - les permissions retirées du catalogue sont supprimées, celles qui manquent créées.
 * Toute la logique vit dans `permission-catalog-sync.ts`, partagée avec la migration
 * `SyncPermissionCatalogV2` (qui applique la même synchronisation au démarrage en prod).
 *
 * ⚠️ Effet visible : côté API < 30 s (cache `EffectivePermissionsService`) ; côté web à la
 * RECONNEXION (les permissions d'affichage sont chargées au login).
 *
 * 🚨 **Garde-fou de suppression (2026-08-11).** La synchronisation fait un
 * `DELETE FROM permissions` sur tout slug absent du catalogue, **et ses liens de rôles avec**.
 * En déploiement non supervisé, c'est le seul geste de ce lot qui puisse retirer des droits à
 * des gens sans que personne le voie passer. Le seed **refuse donc d'écrire** dès qu'une
 * suppression est prévue, et rend la liste ; il faut alors la lire et confirmer par
 * `--allow-deletions`. Un déploiement normal n'en supprime aucune.
 *
 * Exécution (depuis api/) :
 *   npm run seed:permissions
 *   npm run seed:permissions -- --dry-run           # joue tout puis annule, pour voir les compteurs
 *   npm run seed:permissions -- --allow-deletions   # exigé SI des slugs doivent disparaître
 *   npm run seed:permissions -- --no-backup
 */

/** Contrôle : tout slug exigé par le code doit exister dans le catalogue. */
function controlerCouvertureDuCode(): boolean {
  const racineApi = path.resolve(__dirname, '..');
  const racineWeb = path.resolve(__dirname, '..', '..', '..', 'web');
  const slugsCatalogue = new Set(listCatalogPermissions().map((p) => p.slug));

  const manquantsApi = listEnforcedApiSlugs(racineApi).filter(
    (u) => !slugsCatalogue.has(u.slug),
  );
  const manquantsWeb = listWebPermissionSlugs(racineWeb).filter(
    (u) => !slugsCatalogue.has(u.slug),
  );

  if (manquantsApi.length === 0 && manquantsWeb.length === 0) {
    console.log('[seed] Contrôle : tous les slugs exigés par le code existent au catalogue. ✅');
    return true;
  }
  console.log(
    '\n[seed] ⚠️ Slugs exigés par le code et ABSENTS du catalogue - la fonction correspondante ' +
      'est fermée à tous sauf is_admin (API) ou masquée pour tous (web) :',
  );
  for (const u of manquantsApi) {
    console.log(`  API  ${u.slug.padEnd(52)} ${u.files.slice(0, 2).join(', ')}`);
  }
  for (const u of manquantsWeb) {
    console.log(`  WEB  ${u.slug.padEnd(52)} ${u.files.slice(0, 2).join(', ')}`);
  }
  console.log(
    '  (le scan est textuel : il relève aussi le code commenté et les exemples de JSDoc - ' +
      'vérifier l’usage réel avant d’ajouter un slug au catalogue)',
  );
  // Un slug API manquant ferme une route : c'est bloquant. Un slug web manquant ne fait
  // que masquer un bouton : signalé, non bloquant.
  return manquantsApi.length === 0;
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const backup = !process.argv.includes('--no-backup');
  const allowDeletions = process.argv.includes('--allow-deletions');

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[seed] Base cible : ${ds.options.database as string}`);

  const runner = ds.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();

  try {
    const rapport = await syncPermissionCatalog(runner.manager, {
      backup: backup && !dryRun,
    });

    console.log(
      `\n[seed] Modules      : +${rapport.modulesInseres} · ~${rapport.modulesMisAJour} · -${rapport.modulesSupprimes}\n` +
        `[seed] Permissions  : +${rapport.permissionsInserees} · ~${rapport.permissionsMisesAJour} · -${rapport.permissionsSupprimees.length}\n` +
        `[seed] Liens        : +${rapport.liensInseres} · élargis ${rapport.liensElargis} · -${rapport.liensSupprimes} · orphelins purgés ${rapport.liensOrphelinsPurges}`,
    );
    if (rapport.permissionsSupprimees.length) {
      console.log(`[seed] Slugs supprimés (${rapport.permissionsSupprimees.length}) :`);
      for (const s of rapport.permissionsSupprimees) console.log(`   - ${s}`);
    }
    console.log('[seed] Permissions actives par rôle :', rapport.actifsParRole);
    if (rapport.backupFile) console.log(`[seed] Sauvegarde : ${rapport.backupFile}`);

    const couvertureOk = controlerCouvertureDuCode();

    if (dryRun) {
      await runner.rollbackTransaction();
      console.log('\n[seed] --dry-run : transaction annulée, la base est inchangée.');
    } else if (rapport.permissionsSupprimees.length > 0 && !allowDeletions) {
      // 🚨 Supprimer une permission emporte ses liens de rôles : des utilisateurs perdent un
      // droit sans que rien ne le signale. On refuse plutôt que de le faire en silence.
      await runner.rollbackTransaction();
      console.error(
        `\n[seed] ❌ ${rapport.permissionsSupprimees.length} permission(s) seraient SUPPRIMÉES `
        + `(avec leurs liens de rôles). Transaction annulée, la base est inchangée.`,
      );
      console.error(
        '        Relire la liste ci-dessus. Si ces suppressions sont voulues :\n'
        + '        npm run seed:permissions -- --allow-deletions',
      );
      process.exit(2);
    } else if (!couvertureOk) {
      await runner.rollbackTransaction();
      console.error('\n[seed] ❌ Couverture incomplète côté API : transaction annulée.');
      process.exit(1);
    } else {
      await runner.commitTransaction();
      console.log(
        '\n[seed] Terminé. Effet API < 30 s ; se reconnecter pour l’affichage côté web.',
      );
    }
  } catch (err) {
    await runner.rollbackTransaction();
    throw err;
  } finally {
    await runner.release();
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[seed] Échec :', err);
  process.exit(1);
});
