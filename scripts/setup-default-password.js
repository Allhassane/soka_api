/**
 * Initialise le flux « mot de passe par défaut + changement à la 1re connexion ».
 *
 *  1) Ajoute la colonne `users.must_change_password` (TINYINT(1) DEFAULT 1) si absente.
 *  2) Pose le mot de passe par défaut `nrh2030` (hash bcrypt) + must_change_password=1
 *     sur tous les comptes encore au défaut (WHERE must_change_password=1).
 *
 * Idempotent et SANS PERTE : ne touche JAMAIS un compte déjà initialisé
 * (must_change_password=0, càd qui a déjà reçu/choisi son vrai mot de passe).
 * Au 1er passage, la colonne vient d'être créée avec DEFAULT 1 → TOUS les comptes
 * (admin inclus, conformément au choix) reçoivent nrh2030.
 *
 * `synchronize` est OFF en prod → ce script fait office de migration.
 *
 * Usage :
 *   node scripts/setup-default-password.js
 *   DEFAULT_PASSWORD=autre node scripts/setup-default-password.js   (change le mot de passe par défaut)
 *
 * Surcharges DB (défauts = mêmes que les autres scripts) :
 *   DB_HOST=127.0.0.1 DB_PORT=3306 DB_USER=root DB_PASSWORD='' DB_NAME=soka_db
 */
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'nrh2030';

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'soka_db',
};

(async () => {
  const c = await mysql.createConnection(DB);
  const q = (s, p) => c.query(s, p).then((r) => r[0]);

  // 1) Colonne must_change_password : créée si absente (idempotent via information_schema)
  const col = await q(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'must_change_password'`,
    [DB.database],
  );

  if (col.length === 0) {
    console.log('→ Ajout de la colonne users.must_change_password (DEFAULT 1)…');
    await q(
      "ALTER TABLE users ADD COLUMN must_change_password TINYINT(1) NOT NULL DEFAULT 1",
    );
    console.log('  colonne ajoutée. (Toutes les lignes existantes sont à 1.)');
  } else {
    console.log('→ Colonne users.must_change_password déjà présente.');
  }

  // 2) Pose nrh2030 sur tous les comptes encore au défaut (must_change_password=1).
  //    On hash une seule fois (le mot de passe est public/connu : pas besoin d'un sel distinct par compte).
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

  const pending = (await q(
    'SELECT COUNT(*) n FROM users WHERE must_change_password = 1',
  ))[0].n;

  const res = await q(
    'UPDATE users SET password = ?, must_change_password = 1 WHERE must_change_password = 1',
    [hash],
  );

  // Vérif : le hash écrit correspond bien au mot de passe par défaut.
  const check = await bcrypt.compare(DEFAULT_PASSWORD, hash);

  const total = (await q('SELECT COUNT(*) n FROM users'))[0].n;
  const initialized = (await q(
    'SELECT COUNT(*) n FROM users WHERE must_change_password = 0',
  ))[0].n;

  console.log('\n========== RÉSULTAT ==========');
  console.log('  mot de passe par défaut : "' + DEFAULT_PASSWORD + '"');
  console.log('  vérif bcrypt            : ' + (check ? 'OK ✅' : 'ÉCHEC ❌'));
  console.log('  comptes (re)mis au défaut : ' + (res.affectedRows ?? pending));
  console.log('  --------------------------------');
  console.log('  total comptes           : ' + total);
  console.log('  déjà initialisés (=0)   : ' + initialized + '  (non touchés)');
  console.log('  au défaut nrh2030 (=1)  : ' + (total - initialized));
  console.log('\nLes comptes au défaut recevront un mot de passe par SMS à leur 1re connexion avec "' + DEFAULT_PASSWORD + '".');

  await c.end();
})().catch((e) => {
  console.error('FATAL', e.message);
  process.exit(1);
});
