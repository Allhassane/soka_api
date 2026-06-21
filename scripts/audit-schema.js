/**
 * Audit de dérive de schéma - SOKA
 * Compare le schéma ATTENDU par les entités TypeORM (source de vérité, via le dist compilé)
 * au schéma RÉEL de la base `soka_db` (information_schema).
 *
 * Usage : depuis api/ →  npm run build  &&  node scripts/audit-schema.js
 * Pré-requis : MySQL local (soka_db) accessible avec les identifiants ci-dessous.
 */
require('reflect-metadata');
const { DataSource } = require('typeorm');
const mysql = require('mysql2/promise');

const DB = { host: 'localhost', port: 3306, user: 'root', password: '', database: 'soka_db' };

const ds = new DataSource({
  type: 'mysql',
  host: DB.host, port: DB.port, username: DB.user, password: DB.password, database: DB.database,
  entities: ['dist/**/*.entity.js'],
  synchronize: false,
  logging: false,
});

(async () => {
  await ds.initialize();

  // Schéma attendu (entités) : table -> Set(colonnes DB)
  const expected = {};
  for (const md of ds.entityMetadatas) {
    const t = md.tableName;
    if (!expected[t]) expected[t] = new Set();
    for (const col of md.columns) expected[t].add(col.databaseName);
  }

  // Schéma réel (base)
  const conn = await mysql.createConnection({
    host: DB.host, port: DB.port, user: DB.user, password: DB.password, database: DB.database,
  });
  const [rows] = await conn.query(
    "SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
    [DB.database],
  );
  const live = {};
  for (const r of rows) {
    const t = r.TABLE_NAME || r.table_name;
    const c = r.COLUMN_NAME || r.column_name;
    (live[t] = live[t] || new Set()).add(c);
  }
  await conn.end();
  await ds.destroy();

  const absent = [], incomplete = [], ok = [];
  for (const t of Object.keys(expected).sort()) {
    const exp = expected[t], lv = live[t];
    if (!lv) { absent.push({ t, n: exp.size }); continue; }
    const missing = [...exp].filter((c) => !lv.has(c));
    if (missing.length) incomplete.push({ t, expN: exp.size, lvN: lv.size, missing });
    else ok.push(t);
  }

  console.log('=== RESUME : OK=' + ok.length + '  INCOMPLET=' + incomplete.length + '  ABSENT=' + absent.length +
    '  (sur ' + Object.keys(expected).length + ' tables d\'entites) ===');
  console.log('\n--- Tables ALIGNEES ---\n' + (ok.join(', ') || '(aucune)'));
  console.log('\n--- Tables ABSENTES en base (a creer) ---');
  for (const a of absent) console.log('  ' + a.t + '  (' + a.n + ' col. attendues)');
  console.log('\n--- Tables INCOMPLETES (colonnes manquantes en base) ---');
  for (const i of incomplete) {
    console.log('  [' + i.t + ']  entite=' + i.expN + ' / base=' + i.lvN + '  MANQUE (' + i.missing.length + '): ' + i.missing.join(', '));
  }
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
