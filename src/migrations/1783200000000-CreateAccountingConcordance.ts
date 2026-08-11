import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Module Comptabilité, chantier « concordance » : instantanés de rapprochement app ↔ guichet
 * HUB2 et leur détail ligne à ligne.
 *
 * **Pourquoi deux tables.** Un instantané (`acc_hub_snapshots`) porte les totaux constatés des
 * deux côtés à un moment donné - c'est lui qui répond à la question « les comptes tombent-ils
 * juste ? ». Ses lignes (`acc_hub_snapshot_lines`) ne sont peuplées que pour un import d'export
 * HUB2 : elles portent le détail de chaque transaction du guichet et son appariement, donc la
 * DÉCOMPOSITION de l'écart. Sans elles, un écart n'est qu'un nombre ; avec elles, il a un nom.
 *
 * 🚨 **Ces tables ne dupliquent JAMAIS un statut de paiement.** Le module est en lecture seule
 * sur `payments` / `subscription_payments`. `match_status` qualifie un RAPPROCHEMENT, pas un
 * paiement : le confondre avec `payments.payment_status` créerait une seconde vérité sur
 * l'argent, exactement ce qui a produit les écarts de début août.
 *
 * ⚠️ **`opening_balance` (196 XOF par défaut) est une COLONNE, pas une constante enfouie.** Le
 * solde du compte de collecte au 24/07, avant mise en service : le rapprochement du 09/08 ne
 * s'est fermé qu'avec lui (`196 + 0,98 × brut`). Il doit s'afficher comme une ligne du décompte,
 * sinon le premier lecteur qui refait le calcul trouve 196 XOF d'écart et cesse de faire
 * confiance à l'écran.
 *
 * ⚠️ Collation `utf8mb4_unicode_ci` : celle des tables récentes. `matched_payment_uuid` référence
 * `payments.uuid`, table en **latin1** - la jointure est faite côté requête. latin1 × utf8mb4 se
 * joignent sans problème (MySQL convertit) ; c'est utf8mb4 × utf8mb4 d'une AUTRE collation qui
 * casse en 1267, piège déjà rencontré sur ce projet.
 *
 * ⚠️ Pas de `DEFAULT (UUID())` : blocage binlog STATEMENT connu sur cette base. Les uuid sont
 * générés par hook `@BeforeInsert` côté entité.
 *
 * ADDITIVE, IDEMPOTENTE, réversible.
 */
export class CreateAccountingConcordance1783200000000 implements MigrationInterface {
  name = 'CreateAccountingConcordance1783200000000';

  private async tableExiste(qr: QueryRunner, nom: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.TABLES
        WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [nom],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await this.tableExiste(qr, 'acc_hub_snapshots'))) {
      await qr.query(`
        CREATE TABLE \`acc_hub_snapshots\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`uuid\` CHAR(36) NOT NULL,
          \`kind\` ENUM('gateway','export') NOT NULL,
          \`label\` VARCHAR(191) NOT NULL,
          \`period_start\` DATETIME NULL,
          \`period_end\` DATETIME NULL,
          \`imported_file\` VARCHAR(255) NULL,
          \`created_by_uuid\` CHAR(36) NULL,
          \`opening_balance\` DECIMAL(14,2) NOT NULL DEFAULT 196.00,
          \`hub_total_count\` INT NOT NULL DEFAULT 0,
          \`hub_success_count\` INT NOT NULL DEFAULT 0,
          \`hub_gross\` DECIMAL(14,2) NOT NULL DEFAULT 0,
          \`hub_fees\` DECIMAL(14,2) NOT NULL DEFAULT 0,
          \`hub_net\` DECIMAL(14,2) NOT NULL DEFAULT 0,
          \`app_success_count\` INT NOT NULL DEFAULT 0,
          \`app_gross\` DECIMAL(14,2) NOT NULL DEFAULT 0,
          \`app_fees_theoretical\` DECIMAL(14,2) NOT NULL DEFAULT 0,
          \`app_net\` DECIMAL(14,2) NOT NULL DEFAULT 0,
          \`gap_gross\` DECIMAL(14,2) NOT NULL DEFAULT 0,
          \`gap_net\` DECIMAL(14,2) NOT NULL DEFAULT 0,
          \`matched_count\` INT NOT NULL DEFAULT 0,
          \`unmatched_hub_count\` INT NOT NULL DEFAULT 0,
          \`unmatched_app_count\` INT NOT NULL DEFAULT 0,
          \`mismatch_count\` INT NOT NULL DEFAULT 0,
          \`truncated\` TINYINT(1) NOT NULL DEFAULT 0,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          \`deleted_at\` DATETIME(6) NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_acc_hub_snapshots_uuid\` (\`uuid\`),
          KEY \`IDX_acc_hub_snapshots_kind\` (\`kind\`),
          KEY \`IDX_acc_hub_snapshots_created\` (\`created_at\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    if (!(await this.tableExiste(qr, 'acc_hub_snapshot_lines'))) {
      await qr.query(`
        CREATE TABLE \`acc_hub_snapshot_lines\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`uuid\` CHAR(36) NOT NULL,
          \`snapshot_uuid\` CHAR(36) NOT NULL,
          \`hub_payment_id\` VARCHAR(40) NOT NULL,
          \`hub_status\` VARCHAR(32) NOT NULL,
          \`amount\` DECIMAL(14,2) NOT NULL DEFAULT 0,
          \`fees\` DECIMAL(14,2) NOT NULL DEFAULT 0,
          \`provider\` VARCHAR(32) NULL,
          \`msisdn\` VARCHAR(32) NULL,
          \`hub_created_at\` DATETIME NULL,
          \`purchase_reference\` VARCHAR(191) NULL,
          \`matched_payment_uuid\` CHAR(36) NULL,
          \`match_status\` ENUM('matched','unmatched_hub','amount_mismatch','status_mismatch') NOT NULL,
          \`heuristic\` TINYINT(1) NOT NULL DEFAULT 0,
          \`resolution_note\` TEXT NULL,
          \`resolved_by_uuid\` CHAR(36) NULL,
          \`resolved_at\` DATETIME NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          PRIMARY KEY (\`id\`),
          UNIQUE KEY \`UQ_acc_hub_snapshot_lines_uuid\` (\`uuid\`),
          UNIQUE KEY \`UQ_acc_line_snapshot_payment\` (\`snapshot_uuid\`, \`hub_payment_id\`),
          KEY \`IDX_acc_line_match_status\` (\`snapshot_uuid\`, \`match_status\`),
          KEY \`IDX_acc_line_hub_payment\` (\`hub_payment_id\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.tableExiste(qr, 'acc_hub_snapshot_lines')) {
      await qr.query('DROP TABLE `acc_hub_snapshot_lines`');
    }
    if (await this.tableExiste(qr, 'acc_hub_snapshots')) {
      await qr.query('DROP TABLE `acc_hub_snapshots`');
    }
  }
}
