import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index de lecture pour le tableau de bord Comptabilité.
 *
 * Les requêtes du module (cartes KPI + tableau des lignes) filtrent `payments` par
 * (source, payment_status[, source_uuid]) et trient par `created_at` : sans index, chaque
 * clic de carte balaie la table entière. Additive et réversible ; aucun impact d'écriture
 * notable (la table reçoit quelques lignes par minute au pire).
 */
export class AddPaymentsStatsIndex1783400000000 implements MigrationInterface {
  name = 'AddPaymentsStatsIndex1783400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX `IDX_payments_stats` ON `payments` (`source`, `payment_status`, `created_at`)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX `IDX_payments_stats` ON `payments`');
  }
}
