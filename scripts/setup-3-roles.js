/**
 * Refonte RBAC - réduit l'application à EXACTEMENT 3 rôles : ADMINISTRATEUR / RESPONSABLE / MEMBRE.
 *
 * Modèle (décidé 2026-06-20) :
 *  - ADMINISTRATEUR = toutes les permissions (piloté au runtime par le flag users.is_admin).
 *  - RESPONSABLE    = membre ayant >=1 responsabilité ; jeu opérationnel (hors administration) ;
 *                     visibilité scopée à sa structure (mécanisme de scoping existant).
 *  - MEMBRE         = défaut ; ne voit que ses infos (jeu minimal : dashboard).
 *
 * Mapping non destructif :
 *  - `admin`  -> renommé ADMINISTRATEUR (conserve ses 43 perms = toutes).
 *  - `membre` -> renommé RESPONSABLE  (les 31 responsabilités y pointent déjà : aucun re-pointage).
 *  - MEMBRE   -> créé.
 *  - `user`, `gestionnaire`, `importateur` -> supprimés (+ roles_permissions, user_roles, orphelins).
 *
 * Idempotent (rejouable). Snapshot des 4 tables fait AVANT via mysqldump (api/sql/rbac-snapshot-*.sql).
 * Aucune FK vers `roles` => remappage manuel des liens (fait ici). roles.id est char36 hérité =>
 * on écrit en SQL direct (pas via TypeORM, dont l'entité attend un id auto-incrémenté).
 *
 * Usage : node scripts/setup-3-roles.js
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const uuid = () => crypto.randomUUID();

// Matrice RESPONSABLE : opérationnel large, HORS administration
// (collaborateurs, rôles, modules, imports, configurations, tout parametres_*).
const RESPONSABLE_ACTIVE = [
  // Menus opérationnels
  'dashboard_voir_menu_dashboard',
  'membres_voir_menu_membres',
  'membres_voir_menu_liste_membres',
  'activites_voir_menu_activites',
  'journals_voir_menu_destinations',
  'journals_voir_menu_editions',
  'donations_voir_menu_donations',
  'exports_voir_menu_exports',
  'abonnements_voir_menu_abonnements',
  'zones_voir_menu_zones',
  // Actions membres (scopées à sa structure côté API)
  'membres_acceder_alonglet_membre',
  'membres_ajouter_un_membre',
  'membres_modifier_un_membre',
  'membres_supprimer_un_membre',
  // Accès à sa structure
  'gestionnaire_acceder_a_sa_structure',
];

// Matrice MEMBRE : minimal (la vue « mes infos » n'existe pas encore comme slug -> follow-up).
const MEMBRE_ACTIVE = ['dashboard_voir_menu_dashboard'];

const DB = {
  host: '127.0.0.1', port: 3306, user: 'root', password: '',
  database: process.env.DB_NAME || 'soka_app',
};

(async () => {
  const c = await mysql.createConnection(DB);
  const q = (s, p) => c.query(s, p).then((r) => r[0]);
  const one = async (s, p) => (await q(s, p))[0] || null;
  const getRole = (key) => one('SELECT * FROM roles WHERE slug=? OR name=? LIMIT 1', [key, key]);

  // 1) Garde-fou : permissions doivent exister
  const allSlugs = (await q('SELECT slug FROM permissions')).map((r) => r.slug);
  const present = new Set(allSlugs);
  for (const s of [...RESPONSABLE_ACTIVE, ...MEMBRE_ACTIVE]) {
    if (!present.has(s)) console.log('  ⚠ slug de permission ABSENT en base : ' + s);
  }
  console.log('permissions en base : ' + allSlugs.length);

  // 2) ADMINISTRATEUR (priorité au slug cible -> idempotent ; sinon renomme `admin` ; sinon crée)
  let adminUuid;
  let adm = await getRole('administrateur');
  if (adm) { adminUuid = adm.uuid; console.log('ADMINISTRATEUR déjà présent (' + adminUuid + ')'); }
  else {
    const old = await getRole('admin');
    if (old) { await q('UPDATE roles SET name=?, slug=? WHERE uuid=?', ['ADMINISTRATEUR', 'administrateur', old.uuid]); adminUuid = old.uuid; console.log('renommé admin -> ADMINISTRATEUR (' + adminUuid + ')'); }
    else { adminUuid = uuid(); await q('INSERT INTO roles (id, uuid, name, slug, created_at, updated_at) VALUES (?,?,?,?,NOW(6),NOW(6))', [adminUuid, adminUuid, 'ADMINISTRATEUR', 'administrateur']); console.log('ADMINISTRATEUR créé (' + adminUuid + ')'); }
  }

  // 3) RESPONSABLE (slug cible -> idempotent ; sinon renomme `membre` ; sinon crée)
  let respUuid;
  let resp = await getRole('responsable');
  if (resp) { respUuid = resp.uuid; console.log('RESPONSABLE déjà présent (' + respUuid + ')'); }
  else {
    const old = await getRole('membre');
    if (old) { await q('UPDATE roles SET name=?, slug=? WHERE uuid=?', ['RESPONSABLE', 'responsable', old.uuid]); respUuid = old.uuid; console.log('renommé membre -> RESPONSABLE (' + respUuid + ')'); }
    else { respUuid = uuid(); await q('INSERT INTO roles (id, uuid, name, slug, created_at, updated_at) VALUES (?,?,?,?,NOW(6),NOW(6))', [respUuid, respUuid, 'RESPONSABLE', 'responsable']); console.log('RESPONSABLE créé (' + respUuid + ')'); }
  }

  // 4) MEMBRE (créé si absent ; le slug `membre` est libre après le renommage ci-dessus)
  let membreUuid;
  let membre = await getRole('membre');
  if (membre) { membreUuid = membre.uuid; console.log('MEMBRE déjà présent (' + membreUuid + ')'); }
  else { membreUuid = uuid(); await q('INSERT INTO roles (id, uuid, name, slug, created_at, updated_at) VALUES (?,?,?,?,NOW(6),NOW(6))', [membreUuid, membreUuid, 'MEMBRE', 'membre']); console.log('MEMBRE créé (' + membreUuid + ')'); }

  const keep = [adminUuid, respUuid, membreUuid];

  // 5) Matrices : upsert d'une ligne roles_permissions par permission (status 1/0)
  const setMatrix = async (roleUuid, activeSlugs) => {
    const active = new Set(activeSlugs);
    const perms = await q('SELECT uuid, slug FROM permissions');
    let ins = 0, upd = 0;
    for (const p of perms) {
      const st = active.has(p.slug) ? 1 : 0;
      const ex = await one('SELECT id, status FROM roles_permissions WHERE role_uuid=? AND permission_uuid=? LIMIT 1', [roleUuid, p.uuid]);
      if (ex) { if (Number(ex.status) !== st) { await q('UPDATE roles_permissions SET status=? WHERE id=?', [st, ex.id]); upd++; } }
      else { await q('INSERT INTO roles_permissions (uuid, role_uuid, permission_uuid, status, role_id, permission_id) VALUES (?,?,?,?,0,0)', [uuid(), roleUuid, p.uuid, st]); ins++; }
    }
    return { actives: active.size, inserees: ins, maj: upd };
  };
  console.log('ADMINISTRATEUR matrice :', JSON.stringify(await setMatrix(adminUuid, allSlugs)));
  console.log('RESPONSABLE   matrice :', JSON.stringify(await setMatrix(respUuid, RESPONSABLE_ACTIVE)));
  console.log('MEMBRE        matrice :', JSON.stringify(await setMatrix(membreUuid, MEMBRE_ACTIVE)));

  // 6) Suppression de tout ce qui n'est pas l'un des 3 rôles
  const delRP = await q('DELETE FROM roles_permissions WHERE role_uuid IS NULL OR role_uuid NOT IN (?)', [keep]);
  console.log('roles_permissions obsolètes/orphelines supprimées : ' + (delRP.affectedRows ?? '?'));
  const delUR = await q('DELETE FROM user_roles WHERE role_uuid IS NULL OR role_uuid NOT IN (?)', [keep]);
  console.log('user_roles obsolètes supprimées : ' + (delUR.affectedRows ?? '?'));
  const delR = await q('DELETE FROM roles WHERE uuid NOT IN (?)', [keep]);
  console.log('roles obsolètes supprimés : ' + (delR.affectedRows ?? '?'));

  // 7) Vérification finale
  const finalRoles = await q('SELECT name, slug, uuid FROM roles ORDER BY name');
  const matrix = await q(
    'SELECT r.slug, COUNT(rp.id) total, SUM(rp.status=1) actives ' +
    'FROM roles r LEFT JOIN roles_permissions rp ON rp.role_uuid=r.uuid GROUP BY r.slug ORDER BY r.slug',
  );
  const respPtr = (await q('SELECT COUNT(*) n FROM responsibilities WHERE role_uuid=?', [respUuid]))[0].n;
  const orphanRP = (await q('SELECT COUNT(*) n FROM roles_permissions WHERE role_uuid NOT IN (?)', [keep]))[0].n;
  const urLeft = (await q('SELECT COUNT(*) n FROM user_roles'))[0].n;
  console.log('\n========== VÉRIFICATION ==========');
  console.log('rôles finaux (' + finalRoles.length + ') :', JSON.stringify(finalRoles.map((r) => r.name + '/' + r.slug)));
  console.log('matrice :', JSON.stringify(matrix));
  console.log('responsabilités -> RESPONSABLE : ' + respPtr);
  console.log('roles_permissions orphelines restantes : ' + orphanRP);
  console.log('user_roles restants : ' + urLeft);
  const ok = finalRoles.length === 3 && orphanRP === 0;
  console.log(ok ? '✅ OK' : '❌ INCOHÉRENCE - vérifier');

  await c.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
