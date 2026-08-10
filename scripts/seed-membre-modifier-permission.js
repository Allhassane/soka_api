/**
 * Seed RBAC - ajoute la permission d'action `membres_modifier_un_membre`.
 *
 * Contexte (audit P1) : la route `PUT /members/:uuid` n'était protégée par AUCUNE
 * permission, alors que `POST` (ajouter) et `DELETE` (supprimer) le sont. On introduit
 * donc le slug manquant et on l'accorde aux mêmes rôles que `membres_ajouter_un_membre`
 * (typiquement ADMINISTRATEUR + RESPONSABLE), pour ne pas casser l'édition existante.
 *
 * Idempotent. Usage : node scripts/seed-membre-modifier-permission.js
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const uuid = () => crypto.randomUUID();
const NEW_SLUG = 'membres_modifier_un_membre';
const REF_SLUG = 'membres_ajouter_un_membre'; // permission de référence (module + rôles)

(async () => {
  const c = await mysql.createConnection({
    host: '127.0.0.1', port: 3306, user: 'root', password: '',
    database: process.env.DB_NAME || 'soka_app',
  });
  const q = (s, p) => c.query(s, p).then((r) => r[0]);
  const one = async (s, p) => (await q(s, p))[0] || null;

  // 1) Permission de référence (pour récupérer son module et ses rôles)
  const ref = await one('SELECT uuid, module_uuid FROM permissions WHERE slug=? LIMIT 1', [REF_SLUG]);
  if (!ref) { console.error('Permission de référence absente: ' + REF_SLUG); process.exit(1); }

  // 2) Créer la permission si absente
  let perm = await one('SELECT uuid FROM permissions WHERE slug=? LIMIT 1', [NEW_SLUG]);
  if (perm) {
    console.log('Permission déjà présente: ' + NEW_SLUG + ' (' + perm.uuid + ')');
  } else {
    const pu = uuid();
    await q('INSERT INTO permissions (uuid, name, module_uuid, slug) VALUES (?,?,?,?)',
      [pu, 'Modifier un membre', ref.module_uuid, NEW_SLUG]);
    perm = { uuid: pu };
    console.log('Permission créée: ' + NEW_SLUG + ' (' + pu + ')');
  }

  // 3) Accorder (status=1) aux mêmes rôles qui ont déjà la permission de référence active
  const roleRows = await q(
    'SELECT DISTINCT role_uuid FROM roles_permissions WHERE permission_uuid=? AND status=1',
    [ref.uuid],
  );
  let granted = 0, enabled = 0;
  for (const { role_uuid } of roleRows) {
    if (!role_uuid) continue;
    const ex = await one(
      'SELECT id, status FROM roles_permissions WHERE role_uuid=? AND permission_uuid=? LIMIT 1',
      [role_uuid, perm.uuid],
    );
    if (ex) {
      if (Number(ex.status) !== 1) { await q('UPDATE roles_permissions SET status=1 WHERE id=?', [ex.id]); enabled++; }
    } else {
      await q('INSERT INTO roles_permissions (uuid, role_uuid, permission_uuid, status, role_id, permission_id) VALUES (?,?,?,?,0,0)',
        [uuid(), role_uuid, perm.uuid, 1]);
      granted++;
    }
  }
  console.log('Rôles ciblés (calqués sur ' + REF_SLUG + '): ' + roleRows.length + ' | liens créés: ' + granted + ' | réactivés: ' + enabled);

  await c.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
