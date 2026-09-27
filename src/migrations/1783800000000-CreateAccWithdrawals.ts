import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Module Comptabilité : le **compte de retrait** (`acc_withdrawals`).
 *
 * Le décompte du solde HUB2 ne connaissait que les entrées (`initial + brut - commission`). Au
 * premier retrait du compte de collecte - 100 000 F le 2026-09-16 -, le solde relevé est passé
 * sous le calcul pour toujours, et la situation globale est restée rouge en production. Chaque
 * retrait est désormais saisi et retranché : `initial + brut - commission - retraits`.
 *
 * ⚠️ Saisie manuelle : ni le guichet ni HUB2 ne transmettent les retraits. Une saisie erronée
 * s'ANNULE (`deleted_at` + `deleted_by_uuid`), elle ne s'efface pas.
 *
 * ⚠️ Pas de `DEFAULT (UUID())` : blocage binlog STATEMENT connu sur cette base. L'uuid est posé
 * par le hook `@BeforeInsert` de l'entité. Collation `utf8mb4_unicode_ci`, comme les autres
 * tables `acc_*`.
 *
 * ADDITIVE, IDEMPOTENTE, réversible. Ne touche à aucune table existante.
 */
export class CreateAccWithdrawals1783800000000 implements MigrationInterface {
  name = 'CreateAccWithdrawals1783800000000';

  private async tableExiste(qr: QueryRunner, nom: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.TABLES
        WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [nom],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (await this.tableExiste(qr, 'acc_withdrawals')) return;

    await qr.query(`
      CREATE TABLE \`acc_withdrawals\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`uuid\` CHAR(36) NOT NULL,
        \`amount\` DECIMAL(14,2) NOT NULL,
        \`withdrawn_on\` DATE NOT NULL,
        \`label\` VARCHAR(255) NOT NULL,
        \`reference\` VARCHAR(100) NULL,
        \`created_by_uuid\` CHAR(36) NULL,
        \`deleted_by_uuid\` CHAR(36) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` DATETIME(6) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`UQ_acc_withdrawals_uuid\` (\`uuid\`),
        KEY \`IDX_acc_withdrawals_withdrawn_on\` (\`withdrawn_on\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.tableExiste(qr, 'acc_withdrawals')) {
      await qr.query('DROP TABLE `acc_withdrawals`');
    }
  }
}
