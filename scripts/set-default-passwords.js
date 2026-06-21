/**
 * Lot B - Réinitialise le mot de passe de TOUS les membres réels à "nrh2030"
 * et passe `is_connected = 0` (=> leur prochaine connexion sera traitée comme une
 * « première connexion » par le lot C : génération d'un mdp + envoi SMS).
 *
 * EXCLUS (gardent leur mot de passe) : le superadmin technique et les comptes de
 * test `@soka.com` / `is_admin = 1` - leurs numéros sont fictifs (070000000x) et ne
 * peuvent pas recevoir le SMS de première connexion.
 *
 * - Idempotent · snapshot de rollback écrit AVANT (et conservé) · AUCUN SMS envoyé.
 *
 * Usage :  node api/scripts/set-default-passwords.js
 *   (lit la config DB depuis api/.env)
 *
 * Rollback : importer le fichier api/sql/passwords-snapshot-2026-06-20.sql
 */
'use strict';

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

// --- mini chargeur .env (sans dépendance) ---
function loadEnv(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      if (/^\s*#/.test(line) || !line.trim()) continue;
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let [, k, v] = m;
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch (_) {
    /* pas de .env */
  }
}
loadEnv(path.join(__dirname, '..', '.env'));

const DEFAULT_PASSWORD = 'nrh2030';
// Lignes à NE PAS toucher (superadmin technique + comptes de test)
const EXCLUDE = `(is_admin = 1 OR (email IS NOT NULL AND email LIKE '%@soka.com'))`;

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'soka_db',
  });

  try {
    // 1) Snapshot de rollback (conservé s'il existe déjà → préserve l'état ORIGINAL)
    const snapFile = path.join(
      __dirname,
      '..',
      'sql',
      'passwords-snapshot-2026-06-20.sql',
    );
    if (fs.existsSync(snapFile)) {
      console.log(`Snapshot déjà présent, conservé : ${snapFile}`);
    } else {
      const [rows] = await conn.query(
        `SELECT id, password, is_connected FROM users WHERE NOT ${EXCLUDE}`,
      );
      let snap = `-- Snapshot AVANT set-default-passwords (rollback) - ${rows.length} lignes\n`;
      for (const r of rows) {
        const pw = (r.password || '').replace(/'/g, "''");
        snap += `UPDATE users SET password='${pw}', is_connected=${r.is_connected ? 1 : 0} WHERE id=${r.id};\n`;
      }
      fs.mkdirSync(path.dirname(snapFile), { recursive: true });
      fs.writeFileSync(snapFile, snap, 'utf8');
      console.log(`Snapshot écrit : ${snapFile} (${rows.length} lignes)`);
    }

    // 2) Un seul hash bcrypt (tous ont le même mot de passe "nrh2030")
    const hash = await bcrypt.hash(DEFAULT_PASSWORD, 10);

    // 3) Mise à jour : membres réels → nrh2030 + is_connected=0
    const [res] = await conn.query(
      `UPDATE users SET password = ?, is_connected = 0 WHERE NOT ${EXCLUDE}`,
      [hash],
    );
    console.log(
      `Mots de passe réinitialisés à "${DEFAULT_PASSWORD}" : ${res.affectedRows} utilisateur(s), is_connected=0.`,
    );

    // 4) Vérifications
    const [[tot]] = await conn.query(`SELECT COUNT(*) AS n FROM users`);
    const [[excl]] = await conn.query(
      `SELECT COUNT(*) AS n FROM users WHERE ${EXCLUDE}`,
    );
    const [sample] = await conn.query(
      `SELECT phone_number, password FROM users WHERE NOT ${EXCLUDE} LIMIT 1`,
    );
    let check = 'n/a';
    if (sample.length) {
      check = (await bcrypt.compare(DEFAULT_PASSWORD, sample[0].password))
        ? 'OK'
        : 'ÉCHEC';
    }
    console.log(
      `Total users=${tot.n} | exclus (superadmin/tests)=${excl.n} | vérif bcrypt('${DEFAULT_PASSWORD}')=${check}`,
    );
    console.log('✅ Terminé. Aucun SMS envoyé.');
  } finally {
    await conn.end();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
