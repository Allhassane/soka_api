/**
 * Reset / diagnostic du mot de passe d'UN utilisateur (dépannage connexion prod).
 *
 * Fait deux choses :
 *  1) DIAGNOSTIC : affiche si le compte existe, son is_active, et si le mot de passe
 *     actuel ressemble à un vrai hash bcrypt ($2a/$2b/$2y...) ou à du clair (legacy).
 *  2) RESET (optionnel) : si NEW_PASSWORD est fourni, pose un hash bcrypt(10) connu.
 *     Sans NEW_PASSWORD, le script ne MODIFIE RIEN (diagnostic seul).
 *
 * Lecture seule par défaut. Idempotent. À lancer SUR le serveur de prod.
 *
 * Usage (diagnostic seul) :
 *   PHONE=0151645214 node scripts/reset-user-password.js
 *
 * Usage (reset effectif) :
 *   PHONE=0151645214 NEW_PASSWORD='MonMotDePasse123' node scripts/reset-user-password.js
 *
 * Surcharges DB (défauts = mêmes que les autres scripts) :
 *   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD='' DB_NAME=soka_app
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// Charge api/.env (sans dépendance) pour récupérer les identifiants DB de prod.
function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      if (/^\s*#/.test(line) || !line.trim()) continue;
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let [, key, val] = m;
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    /* pas de .env : on garde les défauts */
  }
}
loadEnv(path.join(__dirname, '..', '.env'));

const PHONE = (process.env.PHONE || '').replace(/\s+/g, '').trim();
const NEW_PASSWORD = process.env.NEW_PASSWORD || null;

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'soka_app',
};

(async () => {
  if (!PHONE) {
    console.error('ABORT : fournir PHONE=... (numéro tel que stocké en base).');
    process.exit(1);
  }

  const c = await mysql.createConnection(DB);
  const q = (s, p) => c.query(s, p).then((r) => r[0]);

  // 1) Le compte existe-t-il EXACTEMENT avec ce numéro ?
  const exact = await q(
    'SELECT id, uuid, phone_number, email, is_active, is_admin, member_uuid, password FROM users WHERE phone_number = ?',
    [PHONE],
  );

  if (exact.length === 0) {
    console.log(`\n❌ Aucun utilisateur avec phone_number = "${PHONE}" (correspondance EXACTE).`);
    // Aide : cherche des variantes de format (225..., +225..., espaces) -> explique un 401/aucun SMS.
    const like = await q(
      "SELECT phone_number FROM users WHERE REPLACE(REPLACE(phone_number,' ',''),'+','') LIKE ? LIMIT 10",
      [`%${PHONE.slice(-8)}%`],
    );
    if (like.length > 0) {
      console.log('   ⚠️  Numéros proches trouvés (le format stocké diffère de ce que tu saisis) :');
      like.forEach((u) => console.log('      - ' + JSON.stringify(u.phone_number)));
      console.log('   → relance avec PHONE = la valeur EXACTE ci-dessus.');
    } else {
      console.log('   Aucun numéro proche : ce compte n’existe pas en base de prod.');
    }
    await c.end();
    process.exit(0);
  }

  const u = exact[0];
  const pwd = u.password || '';
  const looksBcrypt = /^\$2[aby]\$/.test(pwd);

  console.log('\n========== DIAGNOSTIC COMPTE ==========');
  console.log('  phone_number : ' + JSON.stringify(u.phone_number));
  console.log('  uuid         : ' + u.uuid);
  console.log('  email        : ' + (u.email ?? '(null)'));
  console.log('  is_active    : ' + u.is_active + (u.is_active ? '' : '  ⚠️  DÉSACTIVÉ → login = 401 "Compte désactivé"'));
  console.log('  is_admin     : ' + u.is_admin);
  console.log('  member_uuid  : ' + (u.member_uuid ?? '(null)'));
  console.log('  password     : ' + (pwd ? `"${pwd.slice(0, 7)}…" (longueur ${pwd.length})` : '(VIDE)'));
  console.log('  -> mot de passe ' + (looksBcrypt
    ? 'au format bcrypt ✅ (un vrai mot de passe DEVRAIT marcher au login)'
    : '❌ N’EST PAS un hash bcrypt (clair/legacy ?) → bcrypt.compare échoue TOUJOURS → 401 pour ce compte'));

  if (!NEW_PASSWORD) {
    console.log('\n(Diagnostic seul : NEW_PASSWORD non fourni, aucune modification.)');
    console.log('Pour poser un mot de passe : relance avec NEW_PASSWORD=\'...\'');
    await c.end();
    process.exit(0);
  }

  // 2) RESET effectif
  if (String(NEW_PASSWORD).length < 6) {
    console.error('\nABORT : NEW_PASSWORD trop court (min 6 caractères).');
    await c.end();
    process.exit(1);
  }

  const hash = await bcrypt.hash(String(NEW_PASSWORD), 10);
  const res = await q('UPDATE users SET password = ? WHERE id = ?', [hash, u.id]);

  // Vérification immédiate : le nouveau mot de passe matche bien le hash écrit.
  const check = await bcrypt.compare(String(NEW_PASSWORD), hash);

  console.log('\n========== RESET EFFECTUÉ ==========');
  console.log('  lignes modifiées : ' + (res.affectedRows ?? '?'));
  console.log('  vérif bcrypt     : ' + (check ? 'OK ✅' : 'ÉCHEC ❌'));
  console.log('  → connecte-toi avec  phone_number=' + u.phone_number + '  /  le mot de passe que tu as fourni.');
  if (!u.is_active) {
    console.log('  ⚠️  RAPPEL : is_active=0 → le login renverra "Compte désactivé" tant que ce n’est pas remis à 1.');
  }

  await c.end();
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
