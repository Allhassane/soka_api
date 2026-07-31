import 'reflect-metadata';
import { v4 as uuidv4 } from 'uuid';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';

/**
 * SEED - Droit de filtrer les campagnes par statut (Abonnements et Zaimu).
 *
 * Contexte : depuis le 2026-07-31, les listes Abonnements et Zaimu n'affichent **que les
 * campagnes en cours**. Voir les autres statuts (terminées, archivées, suspendues…) demande le
 * droit créé ici. Le contrôle est côté API (`resoudreStatutCampagne`) : sans ce droit, un
 * `?status=archived` tapé à la main est refusé, pas seulement masqué à l'écran.
 *
 * ⚠️ **Le lien `roles_permissions` est créé pour CHAQUE rôle, même à `status = 0`.** Sans la
 * ligne, la case correspondante est **incochable** dans Paramètres → Rôles : le basculeur n'a pas
 * d'uuid sur lequel travailler (piège documenté dans le JOURNAL du 2026-07-28). Le droit est
 * accordé (`status = 1`) aux rôles qui administrent déjà les campagnes - ceux qui peuvent en
 * créer - et créé à 0 pour les autres, à ouvrir depuis l'écran des rôles.
 *
 * IDEMPOTENT : une permission ou un lien déjà présent est laissé tel quel, le seed peut être
 * rejoué sans risque (il ne remet pas à 0 un droit ouvert à la main).
 *
 * Exécution (depuis api/) :
 *   npm run seed:campaign-status-filter -- --dry-run
 *   npm run seed:campaign-status-filter
 */

interface PermissionACreer {
  slug: string;
  name: string;
  /** Module d'accueil, repéré par son nom (créé s'il manque). */
  module: string;
  /** Rôles qui reçoivent le droit ouvert : ceux qui portent déjà ce slug. */
  accordeSiRolePossede: string;
}

const PERMISSIONS: PermissionACreer[] = [
  {
    slug: 'abonnements_filtrer_par_statut',
    name: 'Filtrer les campagnes d’abonnement par statut',
    module: 'Abonnements',
    accordeSiRolePossede: 'abonnements_creer',
  },
  {
    slug: 'dons_filtrer_par_statut',
    name: 'Filtrer les campagnes de zaimu par statut',
    module: 'Zaimu',
    accordeSiRolePossede: 'dons_creer',
  },
];

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[droits] Base cible : ${ds.options.database as string}`);
  if (dryRun) console.log('[droits] --dry-run : aucune écriture.');

  const runner = ds.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();

  try {
    const admin = (
      await runner.manager.query(
        'SELECT uuid FROM users WHERE is_admin = 1 LIMIT 1',
      )
    )?.[0];

    for (const p of PERMISSIONS) {
      // ---- Module d'accueil ----
      let mod = (
        await runner.manager.query(
          'SELECT uuid FROM modules WHERE name = ? LIMIT 1',
          [p.module],
        )
      )?.[0];

      if (!mod) {
        const moduleUuid = uuidv4();
        console.log(`[droits] Module « ${p.module} » absent → création.`);
        if (!dryRun) {
          await runner.manager.query(
            'INSERT INTO modules (uuid, name, description, admin_uuid, status) VALUES (?, ?, ?, ?, ?)',
            [
              moduleUuid,
              p.module,
              `Campagnes ${p.module.toLowerCase()}.`,
              admin?.uuid ?? null,
              'enable',
            ],
          );
        }
        mod = { uuid: moduleUuid };
      }

      // ---- Permission ----
      let perm = (
        await runner.manager.query(
          'SELECT uuid FROM permissions WHERE slug = ? LIMIT 1',
          [p.slug],
        )
      )?.[0];

      if (perm) {
        console.log(`[droits] ${p.slug} : déjà présente.`);
      } else {
        const permUuid = uuidv4();
        console.log(`[droits] ${p.slug} : création (module ${p.module}).`);
        if (!dryRun) {
          await runner.manager.query(
            'INSERT INTO permissions (uuid, name, slug, module_uuid) VALUES (?, ?, ?, ?)',
            [permUuid, p.name, p.slug, mod.uuid],
          );
        }
        perm = { uuid: permUuid };
      }

      // ---- Un lien par rôle ----
      const roles = await runner.manager.query('SELECT uuid, name FROM roles');
      const rolesAccordes: string[] = (
        await runner.manager.query(
          `SELECT DISTINCT rp.role_uuid AS uuid
             FROM roles_permissions rp
             JOIN permissions pe ON pe.uuid = rp.permission_uuid
            WHERE pe.slug = ? AND rp.status = 1`,
          [p.accordeSiRolePossede],
        )
      ).map((r: any) => r.uuid);

      let crees = 0;
      let ouverts = 0;
      for (const role of roles) {
        const existe = (
          await runner.manager.query(
            'SELECT uuid FROM roles_permissions WHERE role_uuid = ? AND permission_uuid = ? LIMIT 1',
            [role.uuid, perm.uuid],
          )
        )?.[0];
        if (existe) continue;

        const accorde = rolesAccordes.includes(role.uuid) ? 1 : 0;
        if (accorde) ouverts++;
        crees++;
        if (!dryRun) {
          await runner.manager.query(
            `INSERT INTO roles_permissions (uuid, role_uuid, permission_uuid, role_id, permission_id, status)
             VALUES (?, ?, ?, 0, 0, ?)`,
            [uuidv4(), role.uuid, perm.uuid, accorde],
          );
        }
      }
      console.log(
        `[droits]   liens créés : ${crees} / ${roles.length} rôle(s), dont ${ouverts} avec le droit ouvert ` +
          `(rôles portant « ${p.accordeSiRolePossede} »).`,
      );
    }

    if (dryRun) {
      await runner.rollbackTransaction();
      console.log('[droits] --dry-run : transaction annulée.');
    } else {
      await runner.commitTransaction();
      console.log(
        '[droits] Terminé. ⚠️ Les droits sont résolus par `EffectivePermissionsService` avec un ' +
          'cache court : compter quelques secondes, ou se reconnecter, pour voir l’effet.',
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
  console.error('[droits] Échec :', err);
  process.exit(1);
});
