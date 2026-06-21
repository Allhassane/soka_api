/**
 * Finalisation RBAC - comptes & administrateur unique (2026-06-20).
 *
 *  1) Supprime les comptes test/orphelins (sans membre lié) - sauf l'admin cible.
 *  2) Fixe UN SEUL administrateur : is_admin=1 pour ADMIN_PHONE, 0 pour tous les autres.
 *  3) Affiche la statistique du nombre d'utilisateurs par rôle (rôle DÉRIVÉ au login) :
 *     ADMINISTRATEUR = is_admin=1 ; RESPONSABLE = membre avec >=1 responsabilité ; MEMBRE = le reste.
 *
 * Rôles non stockés par user (modèle auto + scoping) : la stat les recalcule par dérivation.
 * Idempotent. Snapshot `users` pris AVANT via mysqldump (api/sql/users-snapshot-*.sql).
 *
 * Usage : node scripts/finalize-admin-and-cleanup.js   (ADMIN_PHONE=... pour changer le compte admin)
 */
const mysql = require('mysql2/promise');

const ADMIN_PHONE = process.env.ADMIN_PHONE || '0151645214';
const DB = { host: '127.0.0.1', port: 3306, user: 'root', password: '', database: process.env.DB_NAME || 'soka_db' };

(async () => {
  const c = await mysql.createConnection(DB);
  const q = (s, p) => c.query(s, p).then((r) => r[0]);

  // 0) Garde-fou : le compte admin cible doit exister
  const target = (await q('SELECT uuid, phone_number, member_uuid FROM users WHERE phone_number=?', [ADMIN_PHONE]))[0];
  if (!target) { console.error('ABORT : aucun utilisateur avec phone_number=' + ADMIN_PHONE); process.exit(1); }
  console.log('admin cible : ' + ADMIN_PHONE + ' (' + target.uuid + ')');

  const before = (await q('SELECT COUNT(*) n FROM users'))[0].n;

  // 1) Suppression des comptes test/orphelins (aucun membre lié), jamais l'admin cible
  const toDel = await q("SELECT email, phone_number FROM users WHERE (member_uuid IS NULL OR member_uuid='') AND phone_number<>?", [ADMIN_PHONE]);
  console.log('comptes test/orphelins à supprimer (' + toDel.length + ') : ' + JSON.stringify(toDel.map((u) => u.email || u.phone_number)));
  const del = await q("DELETE FROM users WHERE (member_uuid IS NULL OR member_uuid='') AND phone_number<>?", [ADMIN_PHONE]);
  console.log('comptes supprimés : ' + (del.affectedRows ?? '?'));

  // 2) Administrateur unique : is_admin=1 pour la cible, 0 pour tous les autres
  await q('UPDATE users SET is_admin = IF(phone_number=?, 1, 0)', [ADMIN_PHONE]);
  const admins = await q('SELECT phone_number, email FROM users WHERE is_admin=1');
  console.log('administrateur(s) (is_admin=1) : ' + JSON.stringify(admins.map((u) => u.phone_number)));

  // 3) Statistique par rôle (dérivé) - précédence ADMINISTRATEUR > RESPONSABLE > MEMBRE
  const stats = (await q(
    `SELECT
       SUM(u.is_admin=1) AS ADMINISTRATEUR,
       SUM(u.is_admin=0 AND r.has_resp=1) AS RESPONSABLE,
       SUM(u.is_admin=0 AND r.has_resp IS NULL) AS MEMBRE,
       COUNT(*) AS TOTAL
     FROM users u
     LEFT JOIN (
       SELECT DISTINCT member_uuid, 1 AS has_resp
       FROM member_responsibilities
       WHERE deleted_at IS NULL AND member_uuid IS NOT NULL AND member_uuid<>''
     ) r ON r.member_uuid = u.member_uuid`,
  ))[0];

  const after = (await q('SELECT COUNT(*) n FROM users'))[0].n;
  console.log('\n========== STATISTIQUE - UTILISATEURS PAR RÔLE ==========');
  console.log('  ADMINISTRATEUR : ' + Number(stats.ADMINISTRATEUR));
  console.log('  RESPONSABLE    : ' + Number(stats.RESPONSABLE));
  console.log('  MEMBRE         : ' + Number(stats.MEMBRE));
  console.log('  --------------------------------');
  console.log('  TOTAL          : ' + Number(stats.TOTAL) + '  (users ' + before + ' -> ' + after + ')');

  await c.end();
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
