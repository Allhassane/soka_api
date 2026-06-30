import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuotaPerCentreToActivities1782400000000 implements MigrationInterface {
  name = 'AddQuotaPerCentreToActivities1782400000000';

  private async hasColumn(qr: QueryRunner, table: string, column: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
      [table, column],
    );
    return r.length > 0;
  }

  async up(qr: QueryRunner): Promise<void> {
    const exists = await this.hasColumn(qr, 'activities', 'quota_per_centre');
    if (!exists) {
      await qr.query(
        `ALTER TABLE \`activities\` ADD COLUMN \`quota_per_centre\` int NULL AFTER \`capacity\``,
      );
    }
  }

  async down(qr: QueryRunner): Promise<void> {
    const exists = await this.hasColumn(qr, 'activities', 'quota_per_centre');
    if (exists) {
      await qr.query(`ALTER TABLE \`activities\` DROP COLUMN \`quota_per_centre\``);
    }
  }
}
