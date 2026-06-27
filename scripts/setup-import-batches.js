/**
 * setup-import-batches.js - IDEMPOTENT
 *
 * Met en place le suivi des erreurs d'import « par fichier chargé » :
 *   1. crée la table `import_batches` (un enregistrement par commit d'import) si absente ;
 *   2. ajoute la colonne `import_failures.batch_uuid` (+ index) si absente.
 *
 * `synchronize` est OFF → ce script joue le rôle de migration. Réexécutable sans risque :
 * vérifie l'existence via information_schema avant toute modification (rien de destructif).
 *
 * Usage : node scripts/setup-import-batches.js [--dry]
 */
const mysql = require('mysql2/promise');

const DB = 'soka_db';
const DRY = process.argv.includes('--dry');

const CREATE_BATCHES = `
CREATE TABLE IF NOT EXISTS \`import_batches\` (
  \`id\` INT NOT NULL AUTO_INCREMENT,
  \`uuid\` CHAR(36) NOT NULL,
  \`file_name\` VARCHAR(255) NULL,
  \`total_rows\` INT NOT NULL DEFAULT 0,
  \`created_count\` INT NOT NULL DEFAULT 0,
  \`updated_count\` INT NOT NULL DEFAULT 0,
  \`failed_count\` INT NOT NULL DEFAULT 0,
  \`admin_uuid\` VARCHAR(36) NULL,
  \`created_at\` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uq_import_batches_uuid\` (\`uuid\`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;

(async () => {
  const cn = await mysql.createConnection({
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: DB,
    multipleStatements: true,
  });

  const tableExists = async (table) => {
    const [r] = await cn.query(
      `SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?`,
      [DB, table],
    );
    return r.length > 0;
  };
  const columnExists = async (table, column) => {
    const [r] = await cn.query(
      `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?`,
      [DB, table, column],
    );
    return r.length > 0;
  };
  const indexExists = async (table, index) => {
    const [r] = await cn.query(
      `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND INDEX_NAME=?`,
      [DB, table, index],
    );
    return r.length > 0;
  };

  if (!(await tableExists('import_failures'))) {
    console.error(
      "ERREUR : la table `import_failures` n'existe pas. Exécutez d'abord sql/import_failures.sql.",
    );
    await cn.end();
    process.exit(1);
  }

  const hadBatches = await tableExists('import_batches');
  const hasBatchUuid = await columnExists('import_failures', 'batch_uuid');
  const hasIdx = await indexExists('import_failures', 'idx_import_failures_batch');

  console.log('=== Plan ===');
  console.log('  ' + (hadBatches ? 'OK     import_batches : déjà présente' : 'CREATE import_batches'));
  console.log('  ' + (hasBatchUuid ? 'OK     import_failures.batch_uuid : déjà présente' : 'ADD    import_failures.batch_uuid VARCHAR(36) NULL'));
  console.log('  ' + (hasIdx ? 'OK     idx_import_failures_batch : déjà présent' : 'ADD    idx_import_failures_batch (batch_uuid)'));

  if (DRY) {
    console.log('\n[DRY] aucune modification appliquée.');
    await cn.end();
    return;
  }

  console.log('\n=== Application ===');
  await cn.query(CREATE_BATCHES);
  console.log('  import_batches : OK');

  if (!hasBatchUuid) {
    await cn.query(
      'ALTER TABLE `import_failures` ADD COLUMN `batch_uuid` VARCHAR(36) NULL AFTER `dedup_key`',
    );
    console.log('  import_failures.batch_uuid : ajoutée');
  }
  // L'index suppose la colonne présente (désormais le cas).
  if (!(await indexExists('import_failures', 'idx_import_failures_batch'))) {
    await cn.query(
      'ALTER TABLE `import_failures` ADD INDEX `idx_import_failures_batch` (`batch_uuid`)',
    );
    console.log('  idx_import_failures_batch : ajouté');
  }

  await cn.end();
  console.log('\nTerminé.');
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
