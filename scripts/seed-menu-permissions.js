/**
 * Seed RBAC — couche 2 : permissions de menu (`*_voir_menu_*`).
 *
 * 0) Aligne `roles_permissions.status` sur l'entité (boolean/tinyint) — sinon le front
 *    (`status === true`) ne voit jamais les permissions stockées en varchar '1'.
 * 0b) Répare `roles.uuid`/`roles.slug` (vides → cassent le lookup des permissions au login).
 * 1) Extrait les slugs `permission:` de web/config/menus.ts.
 * 2) Crée les permissions manquantes (module « Navigation »).
 * 3) Active ces permissions pour les rôles indiqués (SEED_ROLES, défaut 'admin,gestionnaire').
 *
 * Idempotent. Usage : node scripts/seed-menu-permissions.js   (ou SEED_ROLES="gestionnaire,user" node ...)
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const uuid = () => crypto.randomUUID();
const humanize = (s) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: process.env.DB_NAME || 'soka_db',
  });
  const q = (s, p) => c.query(s, p).then((r) => r[0]);

  // 0) Aligner status sur l'entite boolean (sinon le front ne voit rien)
  const stType = (await q(
    "SELECT COLUMN_TYPE t FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='roles_permissions' AND column_name='status'",
  ))[0].t;
  if (!/tinyint/i.test(stType)) {
    await q('ALTER TABLE roles_permissions MODIFY status tinyint(1) NOT NULL DEFAULT 0');
    console.log("roles_permissions.status -> tinyint(1) (etait " + stType + ")");
  } else console.log('roles_permissions.status deja tinyint');

  // 0b) Reparer roles.uuid / slug
  await q("UPDATE roles SET uuid = id WHERE uuid IS NULL OR uuid = ''");
  await q("UPDATE roles SET slug = LOWER(REPLACE(name, ' ', '_')) WHERE slug IS NULL OR slug = ''");
  console.log('roles.uuid/slug repares');

  // 1) Slugs du menu
  const menusPath = path.resolve(__dirname, '..', '..', 'web', 'config', 'menus.ts');
  const src = fs.readFileSync(menusPath, 'utf8');
  const slugs = [...new Set([...src.matchAll(/permission:\s*["']([^"']+)["']/g)].map((m) => m[1]))];
  console.log('slugs de menu trouves: ' + slugs.length);

  // 2) Module Navigation
  let moduleUuid = (await q("SELECT uuid FROM modules WHERE name='Navigation' LIMIT 1"))[0]?.uuid;
  if (!moduleUuid) {
    moduleUuid = uuid();
    await q('INSERT INTO modules (uuid, name, slug, status) VALUES (?,?,?,?)', [moduleUuid, 'Navigation', 'navigation', 'enable']);
    console.log('module Navigation cree');
  }

  // 3) Permissions
  const permBySlug = {};
  for (const p of await q('SELECT uuid, slug FROM permissions')) permBySlug[p.slug] = p.uuid;
  let created = 0;
  for (const slug of slugs) {
    if (permBySlug[slug]) continue;
    const pu = uuid();
    await q('INSERT INTO permissions (uuid, name, module_uuid, slug) VALUES (?,?,?,?)', [pu, humanize(slug), moduleUuid, slug]);
    permBySlug[slug] = pu;
    created++;
  }
  console.log('permissions de menu creees: ' + created + '/' + slugs.length);

  // 4) Matrice role -> permissions
  const roles = (process.env.SEED_ROLES || 'admin,gestionnaire').split(',').map((s) => s.trim()).filter(Boolean);
  for (const roleName of roles) {
    const role = (await q('SELECT id, uuid FROM roles WHERE name=? OR slug=? LIMIT 1', [roleName, roleName]))[0];
    if (!role) { console.log('  role absent: ' + roleName); continue; }
    const roleUuid = role.uuid || role.id;
    const existing = new Set(
      (await q('SELECT permission_uuid FROM roles_permissions WHERE role_uuid=?', [roleUuid])).map((x) => x.permission_uuid),
    );
    let granted = 0, enabled = 0;
    for (const slug of slugs) {
      const pu = permBySlug[slug];
      if (existing.has(pu)) {
        await q('UPDATE roles_permissions SET status=1 WHERE role_uuid=? AND permission_uuid=?', [roleUuid, pu]);
        enabled++;
      } else {
        await q('INSERT INTO roles_permissions (uuid, role_uuid, permission_uuid, status, role_id, permission_id) VALUES (?,?,?,?,?,?)',
          [uuid(), roleUuid, pu, 1, 0, 0]);
        granted++;
      }
    }
    console.log('  role ' + roleName + ': +' + granted + ' liens, ' + enabled + ' reactives (menu actif)');
  }

  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
