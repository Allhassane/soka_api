import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tableau de bord Comptabilité : le solde HUB2 CONSTATÉ rejoint l'instantané de concordance.
 *
 * Le guichet SOKA Pay relaie le solde réel du compte de collecte HUB2 (`GET /api/v1/balance`).
 * Le stocker sur l'instantané rend chaque rafraîchissement OPPOSABLE : « solde net attendu »
 * (ouverture + brut − frais) face au « solde constaté » au même instant. Sans cette colonne,
 * la preuve s'évapore avec la requête.
 *
 * ⚠️ NULL autorisé et significatif : relevé impossible (guichet muet) ou sans objet (import
 * d'export). Jamais 0 par défaut — un zéro affirmerait un compte vide.
 *
 * ADDITIVE, IDEMPOTENTE, réversible.
 */
export class AddGatewayBalanceToAccSnapshots1783300000000 implements MigrationInterface {
  name = 'AddGatewayBalanceToAccSnapshots1783300000000';

  private async colonneExiste(qr: QueryRunner): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE table_schema = DATABASE() AND table_name = 'acc_hub_snapshots'
          AND column_name = 'gateway_balance' LIMIT 1`,
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await this.colonneExiste(qr))) {
      await qr.query(
        `ALTER TABLE \`acc_hub_snapshots\`
          ADD COLUMN \`gateway_balance\` DECIMAL(14,2) NULL AFTER \`hub_net\``,
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.colonneExiste(qr)) {
      await qr.query('ALTER TABLE `acc_hub_snapshots` DROP COLUMN `gateway_balance`');
    }
  }
}
