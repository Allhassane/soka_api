import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Table de liaison `sokapay_transactions` (intégration SOKA Pay / HUB2).
 *
 * Relie un membre / une cotisation à une session ou un lien SOKA Pay et à son
 * paiement. Créée à l'ouverture du checkout (statut `pending`), passée à
 * `success`/`fail` par le webhook signé (idempotent). Module 100 % isolé : cette
 * migration n'ajoute QU'UNE table neuve, ne touche à aucune table existante.
 *
 * Idempotente (CREATE si absente) et réversible (DROP au revert).
 */
export class CreateSokapayTransactions1782345600000 implements MigrationInterface {
  name = 'CreateSokapayTransactions1782345600000';

  private async hasTable(qr: QueryRunner, table: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (await this.hasTable(qr, 'sokapay_transactions')) return;

    await qr.query(`
      CREATE TABLE \`sokapay_transactions\` (
        \`id\` INT NOT NULL AUTO_INCREMENT,
        \`uuid\` CHAR(36) NOT NULL DEFAULT (UUID()),
        \`provider_session_id\` VARCHAR(64) NULL,
        \`provider_link_id\` VARCHAR(64) NULL,
        \`provider_payment_id\` VARCHAR(64) NULL,
        \`last_event_id\` VARCHAR(64) NULL,
        \`reference\` VARCHAR(191) NULL,
        \`member_uuid\` CHAR(36) NULL,
        \`subscription_uuid\` CHAR(36) NULL,
        \`subscription_payment_uuid\` CHAR(36) NULL,
        \`amount\` INT NOT NULL,
        \`currency\` VARCHAR(8) NOT NULL DEFAULT 'XOF',
        \`provider\` VARCHAR(32) NULL,
        \`status\` ENUM('created','started','stopped','canceled','completed','deleted','archived','pending','init','success','accepted','fail') NOT NULL DEFAULT 'pending',
        \`checkout_url\` TEXT NULL,
        \`raw_event\` JSON NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` DATETIME(6) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`UQ_sokapay_transactions_uuid\` (\`uuid\`),
        INDEX \`IDX_sokapay_transactions_link\` (\`provider_link_id\`),
        INDEX \`IDX_sokapay_transactions_session\` (\`provider_session_id\`),
        INDEX \`IDX_sokapay_transactions_member\` (\`member_uuid\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.hasTable(qr, 'sokapay_transactions')) {
      await qr.query('DROP TABLE `sokapay_transactions`');
    }
  }
}
