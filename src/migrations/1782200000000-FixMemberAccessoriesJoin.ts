import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Nettoyage des colonnes orphelines `member_accessories.member_id` / `accessory_id`.
 *
 * Contexte (audit P2) : l'entité `MemberAccessoryEntity` portait DEUX jeux de colonnes
 * pour la même relation : les colonnes plates `member_uuid` / `accessory_uuid` (utilisées
 * en lecture/écriture par le service) ET des colonnes de jointure `member_id` / `accessory_id`
 * (int) générées par le `@JoinColumn({ referencedColumnName: 'id' })`. Résultat : la relation
 * `member_accessories.accessory` se joignait sur les colonnes `*_id` restées NULL → accessoires
 * invisibles sur la fiche membre.
 *
 * L'entité a été corrigée pour joindre sur `*_uuid` (comme MemberResponsibilityEntity).
 * Cette migration supprime donc les colonnes `*_id` devenues mortes.
 *
 * SÛR : la table est vide au moment du correctif (aucune donnée à réconcilier). Idempotente.
 */
export class FixMemberAccessoriesJoin1782200000000
  implements MigrationInterface
{
  name = 'FixMemberAccessoriesJoin1782200000000';

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
    if (await this.hasColumn(qr, 'member_accessories', 'member_id')) {
      await qr.query('ALTER TABLE `member_accessories` DROP COLUMN `member_id`');
    }
    if (await this.hasColumn(qr, 'member_accessories', 'accessory_id')) {
      await qr.query('ALTER TABLE `member_accessories` DROP COLUMN `accessory_id`');
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (!(await this.hasColumn(qr, 'member_accessories', 'member_id'))) {
      await qr.query('ALTER TABLE `member_accessories` ADD COLUMN `member_id` INT NULL');
    }
    if (!(await this.hasColumn(qr, 'member_accessories', 'accessory_id'))) {
      await qr.query('ALTER TABLE `member_accessories` ADD COLUMN `accessory_id` INT NULL');
    }
  }
}
