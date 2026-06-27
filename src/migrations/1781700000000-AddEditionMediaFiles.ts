import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute à `journal_editions` deux champs média facultatifs :
 *  - cover_image  : URL de la photo de couverture ;
 *  - digital_file : URL de la version numérique (PDF) de l'édition.
 * Idempotent via information_schema.
 */
export class AddEditionMediaFiles1781700000000 implements MigrationInterface {
  name = 'AddEditionMediaFiles1781700000000';

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

  public async up(qr: QueryRunner): Promise<void> {
    const T = 'journal_editions';
    if (!(await this.hasColumn(qr, T, 'cover_image'))) {
      await qr.query(
        `ALTER TABLE \`${T}\` ADD COLUMN \`cover_image\` varchar(255) NULL AFTER \`total_printed\``,
      );
    }
    if (!(await this.hasColumn(qr, T, 'digital_file'))) {
      await qr.query(
        `ALTER TABLE \`${T}\` ADD COLUMN \`digital_file\` varchar(255) NULL AFTER \`cover_image\``,
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    const T = 'journal_editions';
    for (const col of ['digital_file', 'cover_image']) {
      if (await this.hasColumn(qr, T, col)) {
        await qr.query(`ALTER TABLE \`${T}\` DROP COLUMN \`${col}\``);
      }
    }
  }
}
