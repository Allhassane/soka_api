import * as fs from 'fs';
import * as path from 'path';
import { EntityManager } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { listCatalogPermissions, PERMISSION_CATALOG } from './permission-catalog';
import { ROLE_ADMIN_SLUG } from '../shared/constants/constants';

/**
 * Synchronisation CONVERGENTE de la base sur le catalogue (`permission-catalog.ts`).
 *
 * Contrairement à l'ancien `seed:permissions` (purge totale puis « tout coché pour
 * ADMINISTRATEUR et RESPONSABLE, rien pour les autres » - qui effaçait toute curation
 * manuelle des rôles), cette synchronisation PRÉSERVE les droits accordés :
 *
 *  - modules et permissions sont upsertés par slug (libellés/descriptions mis à jour,
 *    uuid conservés - les lignes `roles_permissions` existantes restent valides) ;
 *  - une ligne `roles_permissions` existante GARDE son statut (elle ne peut que
 *    s'élargir via `absorbs`, jamais se fermer) ;
 *  - les permissions retirées du catalogue sont supprimées, avec leurs lignes
 *    `roles_permissions` ; leurs droits accordés sont d'abord fusionnés (OU) dans la
 *    permission qui les `absorbs`, s'il y en a une - personne ne perd une capacité ;
 *  - une permission nouvelle est créée pour CHAQUE rôle (sans ligne, la case de
 *    Paramètres → Rôles est incochable - cf. api/CLAUDE.md), avec pour état initial :
 *    ADMINISTRATEUR = coché ; autres rôles = OU de `absorbs`/`seedFrom`/`defaults` ;
 *  - les lignes orphelines (rôle supprimé, permission supprimée) sont purgées ;
 *  - `role_id` / `permission_id` restent à 0 : le lien réel passe par les `*_uuid`
 *    (écrire une vraie valeur accorderait toutes les permissions de tous les rôles via
 *    la jointure numérique de `permission.service.ts` - piège documenté).
 *
 * Idempotente : rejouée sur une base déjà synchronisée, elle n'écrit rien.
 * Appelée par `npm run seed:permissions` (manuel, --dry-run possible) ET par la
 * migration `SyncPermissionCatalogV2` (donc appliquée seule au démarrage en prod).
 */

export interface SyncReport {
  modulesInseres: number;
  modulesMisAJour: number;
  modulesSupprimes: number;
  permissionsInserees: number;
  permissionsMisesAJour: number;
  permissionsSupprimees: string[];
  liensInseres: number;
  liensElargis: number;
  liensSupprimes: number;
  liensOrphelinsPurges: number;
  backupFile?: string;
  /** Statuts par rôle APRÈS synchronisation : slug de rôle → nombre de permissions actives. */
  actifsParRole: Record<string, number>;
}

interface RoleRow {
  uuid: string;
  slug: string | null;
  name: string;
}

/** Même règle que `ModuleEntity.generateSlug()` / ancien seed. */
export function slugifyModule(nom: string): string {
  return (
    nom
      .toLowerCase()
      .normalize('NFKD')
      // Diacritiques combinants laissés par la normalisation NFKD.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
  );
}

/** Sauvegarde JSON best-effort des trois tables avant toute écriture. */
async function sauvegarder(manager: EntityManager, dossier: string): Promise<string | undefined> {
  try {
    const [modules, permissions, liens] = await Promise.all([
      manager.query('SELECT * FROM modules'),
      manager.query('SELECT * FROM permissions'),
      manager.query('SELECT * FROM roles_permissions'),
    ]);
    fs.mkdirSync(dossier, { recursive: true });
    const fichier = path.join(
      dossier,
      `permissions-avant-sync-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    fs.writeFileSync(fichier, JSON.stringify({ modules, permissions, roles_permissions: liens }, null, 1));
    return fichier;
  } catch {
    // En contexte de migration au boot, un disque en lecture seule ne doit pas bloquer.
    return undefined;
  }
}

export async function syncPermissionCatalog(
  manager: EntityManager,
  options: { backup?: boolean; backupDir?: string } = {},
): Promise<SyncReport> {
  const rapport: SyncReport = {
    modulesInseres: 0,
    modulesMisAJour: 0,
    modulesSupprimes: 0,
    permissionsInserees: 0,
    permissionsMisesAJour: 0,
    permissionsSupprimees: [],
    liensInseres: 0,
    liensElargis: 0,
    liensSupprimes: 0,
    liensOrphelinsPurges: 0,
    actifsParRole: {},
  };

  if (options.backup !== false) {
    rapport.backupFile = await sauvegarder(
      manager,
      options.backupDir ?? path.resolve(__dirname, '..', '..', 'backups'),
    );
  }

  // ---------------------------------------------------------------- état actuel
  const roles = (await manager.query('SELECT uuid, slug, name FROM roles')) as RoleRow[];
  if (roles.length === 0) {
    // Base sans rôle (environnement de test vide) : on synchronise quand même le
    // référentiel, il n'y a simplement aucun lien à créer.
    console.warn('[sync-permissions] Aucun rôle en base : seuls modules et permissions sont synchronisés.');
  }

  const dbModules = (await manager.query(
    'SELECT uuid, name, slug, description FROM modules',
  )) as Array<{ uuid: string; name: string; slug: string | null; description: string | null }>;
  const dbPermissions = (await manager.query(
    'SELECT uuid, slug, name, description, module_uuid FROM permissions',
  )) as Array<{ uuid: string; slug: string; name: string; description: string | null; module_uuid: string | null }>;
  const dbLiens = (await manager.query(
    'SELECT uuid, role_uuid, permission_uuid, status FROM roles_permissions',
  )) as Array<{ uuid: string; role_uuid: string; permission_uuid: string; status: number | boolean }>;

  const permParSlug = new Map(dbPermissions.map((p) => [p.slug, p]));
  const permParUuid = new Map(dbPermissions.map((p) => [p.uuid, p]));
  const roleParUuid = new Map(roles.map((r) => [r.uuid, r]));

  // Instantané des statuts AVANT toute écriture : `absorbs`/`seedFrom` se lisent dessus.
  // statutAvant : role_uuid -> (slug de permission -> statut)
  const statutAvant = new Map<string, Map<string, boolean>>();
  // lienExistant : role_uuid -> (permission_uuid -> ligne)
  const lienExistant = new Map<string, Map<string, { uuid: string; status: boolean }>>();
  for (const lien of dbLiens) {
    const perm = permParUuid.get(lien.permission_uuid);
    const role = roleParUuid.get(lien.role_uuid);
    if (!role) continue; // orpheline : purgée plus bas
    if (!lienExistant.has(lien.role_uuid)) lienExistant.set(lien.role_uuid, new Map());
    lienExistant.get(lien.role_uuid)!.set(lien.permission_uuid, {
      uuid: lien.uuid,
      status: lien.status === true || lien.status === 1,
    });
    if (perm) {
      if (!statutAvant.has(lien.role_uuid)) statutAvant.set(lien.role_uuid, new Map());
      const parSlug = statutAvant.get(lien.role_uuid)!;
      // Un slug peut porter plusieurs lignes (doublons historiques) : OU logique.
      parSlug.set(perm.slug, (parSlug.get(perm.slug) ?? false) || lien.status === true || lien.status === 1);
    }
  }

  const avait = (roleUuid: string, slug: string): boolean =>
    statutAvant.get(roleUuid)?.get(slug) === true;

  // ---------------------------------------------------------------- modules
  // `modules.admin_uuid` porte l'auteur : un compte administrateur, sinon le premier compte.
  const [auteur] = (await manager.query(
    'SELECT uuid FROM users WHERE is_admin = 1 ORDER BY id LIMIT 1',
  )) as Array<{ uuid: string }>;
  const [replis] = auteur
    ? [auteur]
    : ((await manager.query('SELECT uuid FROM users ORDER BY id LIMIT 1')) as Array<{ uuid: string }>);
  const auteurUuid = replis?.uuid ?? null;

  const maintenant = new Date();
  const moduleUuidParNom = new Map<string, string>();
  const slugsModulesCatalogue = new Set<string>();
  for (const mod of PERMISSION_CATALOG) {
    const slug = slugifyModule(mod.name);
    slugsModulesCatalogue.add(slug);
    const existant = dbModules.find((m) => (m.slug ?? slugifyModule(m.name)) === slug);
    if (existant) {
      moduleUuidParNom.set(mod.name, existant.uuid);
      if (
        existant.name !== mod.name ||
        (existant.slug ?? '') !== slug ||
        (existant.description ?? '') !== mod.description
      ) {
        await manager.query(
          'UPDATE modules SET name = ?, slug = ?, description = ?, status = ?, updated_at = ? WHERE uuid = ?',
          [mod.name, slug, mod.description, 'enable', maintenant, existant.uuid],
        );
        rapport.modulesMisAJour++;
      }
    } else {
      const uuid = uuidv4();
      moduleUuidParNom.set(mod.name, uuid);
      await manager.query(
        'INSERT INTO modules (uuid, name, slug, description, admin_uuid, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [uuid, mod.name, slug, mod.description, auteurUuid, 'enable', maintenant, maintenant],
      );
      rapport.modulesInseres++;
    }
  }

  // ---------------------------------------------------------------- permissions (upsert)
  const catalogue = listCatalogPermissions();
  const slugsCatalogue = new Set(catalogue.map((p) => p.slug));
  const uuidPermParSlug = new Map<string, string>();

  for (const p of catalogue) {
    const moduleUuid = moduleUuidParNom.get(p.module)!;
    const existant = permParSlug.get(p.slug);
    if (existant) {
      uuidPermParSlug.set(p.slug, existant.uuid);
      if (
        existant.name !== p.name ||
        (existant.description ?? '') !== p.description ||
        existant.module_uuid !== moduleUuid
      ) {
        await manager.query(
          'UPDATE permissions SET name = ?, description = ?, module_uuid = ?, updated_at = ? WHERE uuid = ?',
          [p.name, p.description, moduleUuid, maintenant, existant.uuid],
        );
        rapport.permissionsMisesAJour++;
      }
    } else {
      const uuid = uuidv4();
      uuidPermParSlug.set(p.slug, uuid);
      await manager.query(
        'INSERT INTO permissions (uuid, name, slug, description, module_uuid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uuid, p.name, p.slug, p.description, moduleUuid, maintenant, maintenant],
      );
      rapport.permissionsInserees++;
    }
  }

  // ---------------------------------------------------------------- liens rôle × permission
  for (const role of roles) {
    const estAdmin = (role.slug ?? '').toLowerCase() === ROLE_ADMIN_SLUG;
    const liensDuRole = lienExistant.get(role.uuid) ?? new Map();
    for (const p of catalogue) {
      const permUuid = uuidPermParSlug.get(p.slug)!;
      const absorbe = p.absorbs.some((s) => avait(role.uuid, s));
      const accorde = p.grantTo.includes((role.slug ?? '').toLowerCase());
      const lien = liensDuRole.get(permUuid);
      if (lien) {
        // Un statut existant ne peut que S'ÉLARGIR (absorption, `grantTo`, rôle admin) -
        // jamais se fermer.
        const cible = lien.status || absorbe || accorde || estAdmin;
        if (cible !== lien.status) {
          await manager.query('UPDATE roles_permissions SET status = ? WHERE uuid = ?', [
            cible ? 1 : 0,
            lien.uuid,
          ]);
          rapport.liensElargis++;
        }
      } else {
        const semis = p.seedFrom.some((s) => avait(role.uuid, s));
        const defaut = p.defaults[(role.slug ?? '').toLowerCase()] === true;
        const statut = estAdmin || absorbe || accorde || semis || defaut;
        await manager.query(
          'INSERT INTO roles_permissions (uuid, role_id, permission_id, role_uuid, permission_uuid, status) VALUES (?, 0, 0, ?, ?, ?)',
          [uuidv4(), role.uuid, permUuid, statut ? 1 : 0],
        );
        rapport.liensInseres++;
      }
    }
  }

  // ---------------------------------------------------------------- suppressions
  // 1. Liens orphelins : rôle supprimé, ou permission qui n'existe déjà plus.
  const purgeOrphelins = await manager.query(
    `DELETE rp FROM roles_permissions rp
       LEFT JOIN roles r ON r.uuid = rp.role_uuid
       LEFT JOIN permissions p ON p.uuid = rp.permission_uuid
      WHERE r.uuid IS NULL OR p.uuid IS NULL`,
  );
  rapport.liensOrphelinsPurges = Number(purgeOrphelins?.affectedRows ?? 0);

  // 2. Permissions hors catalogue (alias absorbés, fantômes retirés) et leurs liens.
  const aSupprimer = dbPermissions.filter((p) => !slugsCatalogue.has(p.slug));
  if (aSupprimer.length > 0) {
    const uuids = aSupprimer.map((p) => p.uuid);
    const suppLiens = await manager.query(
      `DELETE FROM roles_permissions WHERE permission_uuid IN (${uuids.map(() => '?').join(',')})`,
      uuids,
    );
    rapport.liensSupprimes = Number(suppLiens?.affectedRows ?? 0);
    await manager.query(
      `DELETE FROM permissions WHERE uuid IN (${uuids.map(() => '?').join(',')})`,
      uuids,
    );
    rapport.permissionsSupprimees = aSupprimer.map((p) => p.slug).sort();
  }

  // 3. Modules hors catalogue, devenus vides par construction (leurs permissions sont hors
  //    catalogue donc supprimées ci-dessus). Garde-fou : ne supprime que s'ils sont vides.
  const suppModules = await manager.query(
    `DELETE m FROM modules m
       LEFT JOIN permissions p ON p.module_uuid = m.uuid
      WHERE p.uuid IS NULL AND m.slug NOT IN (${[...slugsModulesCatalogue].map(() => '?').join(',')})`,
    [...slugsModulesCatalogue],
  );
  rapport.modulesSupprimes = Number(suppModules?.affectedRows ?? 0);

  // ---------------------------------------------------------------- bilan
  const bilans = (await manager.query(
    `SELECT r.slug AS role_slug, SUM(rp.status = 1) AS actifs
       FROM roles r LEFT JOIN roles_permissions rp ON rp.role_uuid = r.uuid
      GROUP BY r.uuid, r.slug`,
  )) as Array<{ role_slug: string | null; actifs: string | number | null }>;
  for (const b of bilans) rapport.actifsParRole[b.role_slug ?? '?'] = Number(b.actifs ?? 0);

  return rapport;
}
