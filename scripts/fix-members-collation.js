/**
 * fix-members-collation.js - IDEMPOTENT + REVERSIBLE
 *
 * Corrige le bug "Illegal mix of collations" sur GET /members/:uuid (page Détail)
 * et tout endpoint qui joint members -> tables de référence.
 *
 * Cause : la table `members` est en latin1_swedish_ci, donc ses colonnes FK `*_uuid`
 * héritent de latin1_swedish_ci, alors que les `uuid` des tables cibles sont en
 * latin1_general_ci ou utf8mb4_unicode_ci => les JOIN `ON members.X_uuid = cible.uuid`
 * mélangent des collations incompatibles.
 *
 * Correctif : aligner sur utf8mb4_unicode_ci les colonnes impliquées dans les jointures
 * depuis `members` (UUID = ASCII => conversion sans perte).
 *
 * - Écrit un snapshot de rollback (collations d'origine) AVANT toute modification.
 * - Idempotent : ignore une colonne déjà en utf8mb4_unicode_ci.
 * - Préserve type / nullabilité / défaut (introspection information_schema).
 * - Refuse de toucher une colonne portant une contrainte FK (sécurité) -> rapport.
 *
 * Usage : node scripts/fix-members-collation.js [--dry]
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB = process.env.DB_NAME || 'soka_app';
const TARGET_COLLATION = 'utf8mb4_unicode_ci';
const TARGET_CHARSET = 'utf8mb4';
const DRY = process.argv.includes('--dry');

// Colonnes à aligner : FK de members + uuid des tables cibles encore en latin1.
// (members.structure_uuid est déjà utf8mb4 ET porte une FK -> on n'y touche pas ;
//  countries/jobs/departments/divisions.uuid sont déjà utf8mb4.)
const COLUMNS = [
  ['members', 'civility_uuid'],
  ['members', 'marital_status_uuid'],
  ['members', 'country_uuid'],
  ['members', 'city_uuid'],
  ['members', 'formation_uuid'],
  ['members', 'job_uuid'],
  ['members', 'organisation_city_uuid'],
  ['members', 'department_uuid'],
  ['members', 'division_uuid'],
  ['civilities', 'uuid'],
  ['marital_status', 'uuid'],
  ['cities', 'uuid'],
  ['formations', 'uuid'],
  ['organisation_cities', 'uuid'],
  // Jointures des collections (OneToMany) : member_*.member_uuid = members.uuid (utf8mb4).
  // (Les sous-jointures responsibility/accessory/level sont latin1↔latin1 -> déjà cohérentes.)
  ['member_accessories', 'member_uuid'],
  ['member_responsibilities', 'member_uuid'],
];

(async () => {
  const cn = await mysql.createConnection({ host: 'localhost', port: 3306, user: 'root', password: '', database: DB, multipleStatements: true });

  const colDef = async (table, column) => {
    const [r] = await cn.query(
      `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, COLLATION_NAME, CHARACTER_SET_NAME, EXTRA
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`, [DB, table, column]);
    return r[0] || null;
  };

  // FK référençant ou portée par la colonne (sécurité : on ne convertit pas une colonne sous FK)
  const fkOn = async (table, column) => {
    const [r] = await cn.query(
      `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=? AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [DB, table, column]);
    const [r2] = await cn.query(
      `SELECT CONSTRAINT_NAME, TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE REFERENCED_TABLE_SCHEMA=? AND REFERENCED_TABLE_NAME=? AND REFERENCED_COLUMN_NAME=?`,
      [DB, table, column]);
    return { asChild: r, asParent: r2 };
  };

  const ddl = (table, column, def, charset, collation) => {
    const nullClause = def.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
    let s = `ALTER TABLE \`${table}\` MODIFY \`${column}\` ${def.COLUMN_TYPE} CHARACTER SET ${charset} COLLATE ${collation} ${nullClause}`;
    if (def.COLUMN_DEFAULT !== null && def.COLUMN_DEFAULT !== undefined) {
      let d;
      if (/DEFAULT_GENERATED/i.test(def.EXTRA || '')) {
        // défaut fonctionnel (ex. (UUID()) reporté `uuid()`) -> NE PAS échapper en chaîne
        d = `(${def.COLUMN_DEFAULT})`;
      } else if (/^(CURRENT_TIMESTAMP|NULL)$/i.test(def.COLUMN_DEFAULT)) {
        d = def.COLUMN_DEFAULT;
      } else {
        d = cn.escape(def.COLUMN_DEFAULT); // littéral
      }
      s += ` DEFAULT ${d}`;
    }
    return s + ';';
  };

  const snapshotLines = [
    `-- Snapshot rollback collations (généré par fix-members-collation.js) - ${new Date().toISOString()}`,
    `-- Réimporter ce fichier restaure les collations d'origine.`,
    `USE \`${DB}\`;`,
    '',
  ];
  const applyStatements = [];
  const report = [];
  let blockedByFk = false;

  for (const [table, column] of COLUMNS) {
    const def = await colDef(table, column);
    if (!def) { report.push(`SKIP  ${table}.${column} : colonne absente`); continue; }

    if (def.COLLATION_NAME === TARGET_COLLATION) {
      report.push(`OK    ${table}.${column} : déjà ${TARGET_COLLATION}`);
      continue;
    }

    const fk = await fkOn(table, column);
    if (fk.asChild.length || fk.asParent.length) {
      blockedByFk = true;
      report.push(`FK!   ${table}.${column} : contrainte FK détectée (asChild=${fk.asChild.length}, asParent=${fk.asParent.length}) -> NON modifiée`);
      continue;
    }

    // snapshot : restaurer l'état d'origine (charset+collation actuels)
    snapshotLines.push(ddl(table, column, def, def.CHARACTER_SET_NAME, def.COLLATION_NAME));
    // application : passer à la cible
    applyStatements.push([table, column, ddl(table, column, def, TARGET_CHARSET, TARGET_COLLATION)]);
    report.push(`FIX   ${table}.${column} : ${def.COLLATION_NAME} -> ${TARGET_COLLATION}`);
  }

  console.log('=== Plan ===');
  report.forEach(r => console.log('  ' + r));

  // Écrire le snapshot
  const sqlDir = path.join(__dirname, '..', 'sql');
  if (!fs.existsSync(sqlDir)) fs.mkdirSync(sqlDir, { recursive: true });
  const snapPath = path.join(sqlDir, 'collation-snapshot-2026-06-20.sql');
  if (applyStatements.length && !DRY) {
    fs.writeFileSync(snapPath, snapshotLines.join('\n') + '\n', 'utf8');
    console.log(`\nSnapshot rollback écrit : ${snapPath}`);
  }

  if (DRY) { console.log('\n[DRY] aucune modification appliquée.'); await cn.end(); return; }

  console.log('\n=== Application ===');
  for (const [table, column, stmt] of applyStatements) {
    await cn.query(stmt);
    console.log(`  appliqué : ${table}.${column}`);
  }
  if (!applyStatements.length) console.log('  (rien à faire - déjà aligné)');

  await cn.end();
  if (blockedByFk) console.log('\n⚠ Certaines colonnes ont été ignorées (FK). Voir le rapport ci-dessus.');
  console.log('\nTerminé.');
})().catch(e => { console.error('FATAL', e); process.exit(1); });
