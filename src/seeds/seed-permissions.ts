import 'reflect-metadata';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import AppDataSource from '../data-source';
import {
  PERMISSION_CATALOG,
  listCatalogPermissions,
} from '../permission/permission-catalog';
import {
  listEnforcedApiSlugs,
  listWebPermissionSlugs,
} from '../permission/permission-code-usage';
import {
  ROLE_ADMIN_SLUG,
  ROLE_RESPONSABLE_SLUG,
} from '../shared/constants/constants';
import { resetPermissionTables } from './seed-reset-permissions';

/**
 * SEED - Référentiel de permissions complet, à partir de `permissions/permissions-soka-digital.md`
 * (transcrit dans `src/permission/permission-catalog.ts`).
 *
 * Déroulé, le tout dans UNE transaction :
 *   1. purge de `roles_permissions`, `permissions`, `modules` (avec sauvegarde JSON) ;
 *   2. création d'un module par section « ## Module … » du référentiel ;
 *   3. création d'une permission par puce, plus les alias techniques du catalogue ;
 *   4. création d'un lien `roles_permissions` pour CHAQUE rôle × CHAQUE permission.
 *
 * **Rôles servis d'office** : ADMINISTRATEUR et RESPONSABLE reçoivent toutes les permissions
 * (`status = 1`). Les autres rôles (MEMBRE, rôles métier) reçoivent la ligne mais à `status = 0` :
 * sans ligne, la case de Paramètres → Rôles est incochable (« Aucun élément trouvé », le toggle
 * n'a pas d'uuid à mettre à jour - cf. api/CLAUDE.md).
 *
 * ⚠️ Les droits d'une session déjà ouverte ne changent pas : les permissions du front sont
 * chargées au login. Se **reconnecter** pour recetter. Côté API, le cache de
 * `EffectivePermissionsService` expire en 30 s.
 *
 * Exécution (depuis api/) :
 *   npm run seed:permissions
 *   npm run seed:permissions -- --dry-run    # joue tout puis annule, pour voir les compteurs
 *   npm run seed:permissions -- --no-backup
 */

/** Rôles qui reçoivent l'intégralité du référentiel, cochée. */
const ROLES_TOUT_ACCORDE: readonly string[] = [
  ROLE_ADMIN_SLUG,
  ROLE_RESPONSABLE_SLUG,
];

const LOT = 500;

interface LigneModule {
  uuid: string;
  name: string;
  slug: string;
  description: string;
  admin_uuid: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface LignePermission {
  uuid: string;
  name: string;
  slug: string;
  description: string;
  module_uuid: string;
  created_at: Date;
  updated_at: Date;
}

interface LigneRolePermission {
  uuid: string;
  role_id: number;
  permission_id: number;
  role_uuid: string;
  permission_uuid: string;
  status: boolean;
}

/** Même règle que `ModuleEntity.generateSlug()`, appliquée ici pour ne pas dépendre du hook. */
function slugifyModule(nom: string): string {
  return (
    nom
      .toLowerCase()
      .normalize('NFKD')
      // Diacritiques combinants laissés par la normalisation NFKD (même plage que l’entité).
      .replace(/[\u0300-\u036F]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
  );
}

async function insererParLots<T extends object>(
  manager: EntityManager,
  table: string,
  lignes: T[],
): Promise<void> {
  for (let i = 0; i < lignes.length; i += LOT) {
    const lot = lignes.slice(i, i + LOT);
    if (lot.length === 0) continue;
    const colonnes = Object.keys(lot[0]);
    const marqueurs = `(${colonnes.map(() => '?').join(', ')})`;
    const valeurs = lot.flatMap((l) =>
      colonnes.map((c) => (l as Record<string, unknown>)[c]),
    );
    await manager.query(
      `INSERT INTO \`${table}\` (${colonnes.map((c) => `\`${c}\``).join(', ')}) VALUES ` +
        lot.map(() => marqueurs).join(', '),
      valeurs,
    );
  }
}

/** Avertit si un slug exigé par le code n'a pas été créé - la fonction serait fermée. */
function controlerCouvertureDuCode(slugsCrees: Set<string>): void {
  const racineApi = path.resolve(__dirname, '..');
  const racineWeb = path.resolve(__dirname, '..', '..', '..', 'web');

  const manquantsApi = listEnforcedApiSlugs(racineApi).filter(
    (u) => !slugsCrees.has(u.slug),
  );
  const manquantsWeb = listWebPermissionSlugs(racineWeb).filter(
    (u) => !slugsCrees.has(u.slug),
  );

  if (manquantsApi.length === 0 && manquantsWeb.length === 0) {
    console.log(
      '[seed] Contrôle : tous les slugs exigés par le code existent en base. ✅',
    );
    return;
  }
  console.log(
    '\n[seed] ⚠️ Slugs exigés par le code et ABSENTS du catalogue : la fonction correspondante ' +
      'est fermée à tous sauf is_admin.',
  );
  for (const u of manquantsApi) {
    console.log(
      `  API  ${u.slug.padEnd(48)} ${u.files.slice(0, 2).join(', ')}`,
    );
  }
  for (const u of manquantsWeb) {
    console.log(
      `  WEB  ${u.slug.padEnd(48)} ${u.files.slice(0, 2).join(', ')}`,
    );
  }
  console.log(
    '  (le scan est textuel : il relève aussi le code commenté et les exemples de JSDoc - ' +
      'vérifier l’usage réel avant d’ajouter un slug au catalogue)',
  );
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const backup = !process.argv.includes('--no-backup');

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[seed] Base cible : ${ds.options.database as string}`);

  const runner = ds.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();

  try {
    const manager = runner.manager;
    const maintenant = new Date();

    // -- 1. Purge ------------------------------------------------------------------
    const purge = await resetPermissionTables(manager, {
      backup: backup && !dryRun,
    });
    console.log(
      `[seed] Purge : ${purge.modules} module(s), ${purge.permissions} permission(s), ` +
        `${purge.rolePermissions} lien(s) supprimé(s).`,
    );
    if (purge.backupFile)
      console.log(`[seed] Sauvegarde : ${purge.backupFile}`);

    // -- 2. Auteur des modules -----------------------------------------------------
    // `modules.admin_uuid` porte l'auteur du module : on prend un compte administrateur.
    const [auteur] = (await manager.query(
      'SELECT uuid FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1',
    )) as Array<{ uuid: string }>;
    const [premier] = auteur
      ? [auteur]
      : ((await manager.query(
          'SELECT uuid FROM users ORDER BY id LIMIT 1',
        )) as Array<{
          uuid: string;
        }>);
    if (!premier)
      throw new Error(
        'Aucun utilisateur en base : impossible de renseigner admin_uuid.',
      );

    // -- 3. Modules ----------------------------------------------------------------
    const modules: LigneModule[] = PERMISSION_CATALOG.map((mod) => ({
      uuid: uuidv4(),
      name: mod.name,
      slug: slugifyModule(mod.name),
      description: mod.description,
      admin_uuid: premier.uuid,
      status: 'enable',
      created_at: maintenant,
      updated_at: maintenant,
    }));
    await insererParLots(manager, 'modules', modules);
    const uuidParModule = new Map(modules.map((m) => [m.name, m.uuid]));

    // -- 4. Permissions ------------------------------------------------------------
    const catalogue = listCatalogPermissions();
    const permissions: LignePermission[] = catalogue.map((p) => ({
      uuid: uuidv4(),
      name: p.name,
      slug: p.slug,
      description: p.description,
      module_uuid: uuidParModule.get(p.module)!,
      created_at: maintenant,
      updated_at: maintenant,
    }));
    await insererParLots(manager, 'permissions', permissions);

    // -- 5. Liens rôle <-> permission ----------------------------------------------
    const roles = (await manager.query(
      'SELECT uuid, name, slug FROM roles ORDER BY name',
    )) as Array<{ uuid: string; name: string; slug: string }>;
    if (roles.length === 0)
      throw new Error('Aucun rôle en base : rien à rattacher.');

    for (const attendu of ROLES_TOUT_ACCORDE) {
      if (!roles.some((r) => (r.slug ?? '').toLowerCase() === attendu)) {
        console.log(
          `[seed] ⚠️ Rôle « ${attendu} » introuvable : aucune permission ne lui sera accordée.`,
        );
      }
    }

    const liens: LigneRolePermission[] = [];
    for (const role of roles) {
      const toutAccorde = ROLES_TOUT_ACCORDE.includes(
        (role.slug ?? '').toLowerCase(),
      );
      for (const perm of permissions) {
        liens.push({
          // `role_id` / `permission_id` restent à 0 : le lien réel passe par les `*_uuid`
          // (`roles.id` est un CHAR(36), incompatible avec ces colonnes int - cf. api/CLAUDE.md).
          uuid: uuidv4(),
          role_id: 0,
          permission_id: 0,
          role_uuid: role.uuid,
          permission_uuid: perm.uuid,
          status: toutAccorde,
        });
      }
      console.log(
        `[seed]   ${role.name.padEnd(16)} ${permissions.length} lien(s) - ` +
          `${toutAccorde ? 'TOUTES accordées' : 'aucune cochée (à ouvrir depuis Paramètres → Rôles)'}`,
      );
    }
    await insererParLots(manager, 'roles_permissions', liens);

    // -- 6. Rapport ----------------------------------------------------------------
    const alias = catalogue.filter((p) => p.isAlias).length;
    console.log(
      `\n[seed] Modules     : ${modules.length}\n` +
        `[seed] Permissions : ${permissions.length} ` +
        `(${permissions.length - alias} du référentiel + ${alias} alias technique(s))\n` +
        `[seed] Liens       : ${liens.length} (${roles.length} rôle(s) × ${permissions.length})`,
    );
    controlerCouvertureDuCode(new Set(permissions.map((p) => p.slug)));

    if (dryRun) {
      await runner.rollbackTransaction();
      console.log(
        '\n[seed] --dry-run : transaction annulée, la base est inchangée.',
      );
    } else {
      await runner.commitTransaction();
      console.log(
        '\n[seed] Terminé. Se reconnecter pour que les droits prennent effet côté front.',
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
