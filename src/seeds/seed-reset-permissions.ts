import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import AppDataSource from '../data-source';

/**
 * SEED - REMISE À ZÉRO du référentiel de permissions.
 *
 * Vide les trois tables du référentiel, dans l'ordre enfant -> parent :
 *   1. `roles_permissions` (liens rôle <-> permission)
 *   2. `permissions`
 *   3. `modules`
 *
 * ⚠️ **Destructif.** Tant que `seed:permissions` n'a pas été rejoué derrière, plus AUCUN slug
 * n'existe en base : `PermissionsGuard` refuse tout pour les comptes non `is_admin`, et les menus
 * du front disparaissent. Les deux seeds s'enchaînent donc toujours - `seed:permissions` appelle
 * d'ailleurs cette purge lui-même, dans la même transaction.
 *
 * Aucune contrainte de clé étrangère n'existe réellement sur ces tables (vérifié sur `soka_db`) :
 * l'ordre suffit, pas besoin de toucher à `FOREIGN_KEY_CHECKS`. On utilise `DELETE` et non
 * `TRUNCATE`, qui provoquerait un commit implicite et ferait sauter la transaction.
 *
 * Une sauvegarde JSON des lignes supprimées est écrite dans `backups/` avant la purge : c'est le
 * seul moyen de revenir en arrière si le rechargement se passe mal.
 *
 * Exécution (depuis api/) :
 *   npm run seed:reset-permissions              # purge + sauvegarde
 *   npm run seed:reset-permissions -- --dry-run # compte seulement, n'écrit rien
 *   npm run seed:reset-permissions -- --no-backup
 */

export interface ResetOptions {
  /** Écrire la sauvegarde JSON avant de supprimer (défaut : true). */
  backup?: boolean;
  /** Dossier de sauvegarde (défaut : `<api>/backups`). */
  backupDir?: string;
}

export interface ResetReport {
  modules: number;
  permissions: number;
  rolePermissions: number;
  backupFile: string | null;
}

const TABLES = ['roles_permissions', 'permissions', 'modules'] as const;

/** Horodatage `2026-07-28T14-05-33` pour nommer la sauvegarde. */
function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Vide les tables du référentiel de permissions. À appeler DANS une transaction
 * (`manager` = celui du QueryRunner) pour que purge et rechargement soient atomiques.
 */
export async function resetPermissionTables(
  manager: EntityManager,
  options: ResetOptions = {},
): Promise<ResetReport> {
  const {
    backup = true,
    backupDir = path.resolve(__dirname, '..', '..', 'backups'),
  } = options;

  const contenu: Record<string, unknown[]> = {};
  for (const table of TABLES) {
    contenu[table] = await manager.query(`SELECT * FROM \`${table}\``);
  }

  let backupFile: string | null = null;
  if (backup) {
    fs.mkdirSync(backupDir, { recursive: true });
    backupFile = path.join(backupDir, `permissions-${horodatage()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify(contenu, null, 1), 'utf8');
  }

  // Ordre enfant -> parent : les liens d'abord, les modules en dernier.
  for (const table of TABLES) {
    await manager.query(`DELETE FROM \`${table}\``);
  }

  return {
    modules: contenu.modules.length,
    permissions: contenu.permissions.length,
    rolePermissions: contenu.roles_permissions.length,
    backupFile,
  };
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const backup = !process.argv.includes('--no-backup');

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[reset] Base cible : ${ds.options.database as string}`);

  const runner = ds.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const rapport = await resetPermissionTables(runner.manager, {
      backup: backup && !dryRun,
    });

    console.log(
      `[reset] roles_permissions : ${rapport.rolePermissions} ligne(s)`,
    );
    console.log(`[reset] permissions       : ${rapport.permissions} ligne(s)`);
    console.log(`[reset] modules           : ${rapport.modules} ligne(s)`);
    if (rapport.backupFile)
      console.log(`[reset] Sauvegarde : ${rapport.backupFile}`);

    if (dryRun) {
      await runner.rollbackTransaction();
      console.log('[reset] --dry-run : rien n’a été supprimé.');
    } else {
      await runner.commitTransaction();
      console.log('[reset] Tables vidées.');
      console.log(
        '[reset] ⚠️ Enchaîner « npm run seed:permissions » : sans permissions en base, ' +
          'tout est refusé aux comptes non is_admin.',
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

// Exécution directe uniquement (pas quand le fichier est importé par seed-permissions).
if (require.main === module) {
  run().catch((err) => {
    console.error('[reset] Échec :', err);
    process.exit(1);
  });
}
