import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ajoute la colonne `users.must_change_password` (flux « 1re connexion »).
 *
 * Contexte : la colonne a été déclarée sur l'entité `User` (default: true) mais jamais
 * créée en base. `synchronize` étant OFF, toute requête sélectionnant cette colonne
 * échouait (« Unknown column 'user.must_change_password' in 'field list' »), ce qui
 * bloquait TOUTE connexion.
 *
 * ADDITIVE et NON-DESTRUCTIVE : on ajoute uniquement la colonne, en TINYINT(1) NOT NULL
 * DEFAULT 1 (= aligné sur l'entité `default: true` et sur scripts/setup-default-password.js).
 * Les lignes existantes prennent donc 1 (compte considéré « au mot de passe par défaut »).
 *
 * Idempotente : la colonne n'est ajoutée que si elle n'existe pas déjà (gère le cas où
 * setup-default-password.js l'aurait déjà créée).
 */
export class AddMustChangePasswordToUsers1782179184793
  implements MigrationInterface
{
  name = 'AddMustChangePasswordToUsers1782179184793';

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
    if (!(await this.hasColumn(qr, 'users', 'must_change_password'))) {
      await qr.query(
        'ALTER TABLE `users` ADD COLUMN `must_change_password` TINYINT(1) NOT NULL DEFAULT 1',
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.hasColumn(qr, 'users', 'must_change_password')) {
      await qr.query(
        'ALTER TABLE `users` DROP COLUMN `must_change_password`',
      );
    }
  }
}
