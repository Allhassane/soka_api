import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bascule la distribution du journal de la DESTINATION vers la ZONE
 * (architecture zone-centric : 1 ligne de distribution par zone).
 *
 * La table journal_distributions n'a pas encore de données dans le nouveau
 * flux, donc on remplace simplement la colonne destination_uuid par zone_uuid
 * (pas de migration de données). Idempotent via information_schema.
 */
export class PivotJournalDistributionToZone1781500000000
  implements MigrationInterface
{
  name = 'PivotJournalDistributionToZone1781500000000';

  private async hasColumn(
    qr: QueryRunner,
    table: string,
    column: string,
  ): Promise<boolean> {
    const rows = await qr.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column],
    );
    return rows.length > 0;
  }

  private async hasIndex(
    qr: QueryRunner,
    table: string,
    index: string,
  ): Promise<boolean> {
    const rows = await qr.query(
      `SELECT 1 FROM information_schema.statistics
       WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, index],
    );
    return rows.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    const T = 'journal_distributions';
    if (!(await this.hasColumn(qr, T, 'zone_uuid'))) {
      await qr.query(
        `ALTER TABLE \`${T}\` ADD COLUMN \`zone_uuid\` char(36)
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' AFTER \`edition_uuid\``,
      );
    }
    // Drop ancienne contrainte/colonne destination si présentes
    if (await this.hasIndex(qr, T, 'UQ_journal_distributions_edition_destination')) {
      await qr.query(
        `ALTER TABLE \`${T}\` DROP INDEX \`UQ_journal_distributions_edition_destination\``,
      );
    }
    if (await this.hasIndex(qr, T, 'IDX_journal_distributions_destination')) {
      await qr.query(
        `ALTER TABLE \`${T}\` DROP INDEX \`IDX_journal_distributions_destination\``,
      );
    }
    if (await this.hasColumn(qr, T, 'destination_uuid')) {
      await qr.query(`ALTER TABLE \`${T}\` DROP COLUMN \`destination_uuid\``);
    }
    // Index + unicité par zone
    if (!(await this.hasIndex(qr, T, 'IDX_journal_distributions_zone'))) {
      await qr.query(
        `ALTER TABLE \`${T}\` ADD KEY \`IDX_journal_distributions_zone\` (\`zone_uuid\`)`,
      );
    }
    if (!(await this.hasIndex(qr, T, 'UQ_journal_distributions_edition_zone'))) {
      await qr.query(
        `ALTER TABLE \`${T}\` ADD UNIQUE KEY \`UQ_journal_distributions_edition_zone\` (\`edition_uuid\`,\`zone_uuid\`)`,
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    const T = 'journal_distributions';
    if (await this.hasIndex(qr, T, 'UQ_journal_distributions_edition_zone')) {
      await qr.query(
        `ALTER TABLE \`${T}\` DROP INDEX \`UQ_journal_distributions_edition_zone\``,
      );
    }
    if (await this.hasIndex(qr, T, 'IDX_journal_distributions_zone')) {
      await qr.query(
        `ALTER TABLE \`${T}\` DROP INDEX \`IDX_journal_distributions_zone\``,
      );
    }
    if (!(await this.hasColumn(qr, T, 'destination_uuid'))) {
      await qr.query(
        `ALTER TABLE \`${T}\` ADD COLUMN \`destination_uuid\` char(36)
         CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '' AFTER \`edition_uuid\``,
      );
    }
    if (await this.hasColumn(qr, T, 'zone_uuid')) {
      await qr.query(`ALTER TABLE \`${T}\` DROP COLUMN \`zone_uuid\``);
    }
  }
}
