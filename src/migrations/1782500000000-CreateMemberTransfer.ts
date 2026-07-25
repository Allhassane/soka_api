import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Transfert de membres entre structures (module `membres`).
 *
 * - `member_transfers` : la demande (district source → district cible, statut, initiateur,
 *   décideur, motif).
 * - `member_transfer_items` : une ligne par membre concerné. Cette table fait aussi office
 *   d'**historique de mobilité** du membre (`from_structure_uuid` / `to_structure_uuid` figés),
 *   d'où l'absence de table d'audit dédiée.
 *
 * Spécification : `docs/TRANSFERT-MEMBRES.md`.
 *
 * Deux tables NEUVES, aucune donnée existante touchée. Idempotente et réversible.
 *
 * ⚠️ Pas de contrainte FK : le projet joint partout sur les colonnes `*_uuid` à la main
 * (cf. `member_responsibilities`, `committee_members`). On reste cohérent.
 *
 * ⚠️ Pas de `DEFAULT (UUID())` : blocage binlog STATEMENT déjà rencontré sur cette base
 * (cf. en-tête de `1781400000000-CreateJournalModule`). L'uuid est généré côté application
 * par le hook `@BeforeInsert` des entités, comme `MemberEntity.ensureUuid()`.
 *
 * ⚠️ Collation `utf8mb4_unicode_ci` : indispensable pour que les jointures manuelles sur
 * `members.uuid` / `structures.uuid` / `responsibilities.uuid` restent propres.
 *
 * ⚠️ L'unicité « une seule demande EN_ATTENTE par membre » (règle R4) n'est PAS un index :
 * MySQL n'a pas d'index unique partiel, et `status` vit sur la table parente. C'est une garde
 * applicative, posée en transaction avec verrou de ligne (cf. MemberTransferService).
 */
export class CreateMemberTransfer1782500000000 implements MigrationInterface {
  name = 'CreateMemberTransfer1782500000000';

  private async hasTable(qr: QueryRunner, table: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await this.hasTable(qr, 'member_transfers'))) {
      await qr.query(`
        CREATE TABLE \`member_transfers\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`uuid\` CHAR(36) NOT NULL,
          \`direction\` ENUM('SORTANT','ENTRANT') NOT NULL DEFAULT 'SORTANT',
          \`status\` ENUM('EN_ATTENTE','APPROUVEE','REFUSEE','ANNULEE','OBSOLETE') NOT NULL DEFAULT 'EN_ATTENTE',
          \`source_district_uuid\` CHAR(36) NOT NULL,
          \`target_district_uuid\` CHAR(36) NOT NULL,
          \`motif\` VARCHAR(50) NOT NULL DEFAULT 'demenagement',
          \`comment\` TEXT NULL,
          \`initiated_by_user_uuid\` CHAR(36) NOT NULL,
          \`initiated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`decided_by_user_uuid\` CHAR(36) NULL,
          \`decided_at\` DATETIME(6) NULL,
          \`decision_comment\` TEXT NULL,
          \`admin_uuid\` CHAR(36) NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          \`deleted_at\` DATETIME(6) NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`UQ_member_transfers_uuid\` (\`uuid\`),
          INDEX \`IDX_member_transfers_source\` (\`source_district_uuid\`),
          INDEX \`IDX_member_transfers_target\` (\`target_district_uuid\`),
          INDEX \`IDX_member_transfers_status\` (\`status\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await this.hasTable(qr, 'member_transfer_items'))) {
      await qr.query(`
        CREATE TABLE \`member_transfer_items\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`uuid\` CHAR(36) NOT NULL,
          \`transfer_uuid\` CHAR(36) NOT NULL,
          \`member_uuid\` CHAR(36) NOT NULL,
          \`from_structure_uuid\` CHAR(36) NOT NULL,
          \`to_structure_uuid\` CHAR(36) NULL,
          \`lost_responsibility_uuids\` JSON NULL,
          \`applied_at\` DATETIME(6) NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          \`deleted_at\` DATETIME(6) NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`UQ_member_transfer_items_uuid\` (\`uuid\`),
          UNIQUE INDEX \`uq_transfer_member\` (\`transfer_uuid\`, \`member_uuid\`),
          INDEX \`IDX_member_transfer_items_transfer\` (\`transfer_uuid\`),
          INDEX \`IDX_member_transfer_items_member\` (\`member_uuid\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.hasTable(qr, 'member_transfer_items')) {
      await qr.query('DROP TABLE `member_transfer_items`');
    }
    if (await this.hasTable(qr, 'member_transfers')) {
      await qr.query('DROP TABLE `member_transfers`');
    }
  }
}
