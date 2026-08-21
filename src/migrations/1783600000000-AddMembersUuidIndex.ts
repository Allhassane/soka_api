import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * **Index manquants sur les `uuid` joints** - `members.uuid` et `jobs.uuid` (2026-08-19).
 *
 * **Le constat.** `members.uuid` n'avait **aucun index** : ni clé primaire (c'est `id`), ni
 * unique, ni simple. Or c'est la clé de jointure de tout le schéma - `member_responsibilities`,
 * `users.member_uuid`, `subscription_payments.beneficiary_uuid` pointent tous dessus. Chaque
 * jointure faisait donc un **balayage complet** des 8 000 membres (`EXPLAIN` : `type: ALL`,
 * `possible_keys: NULL`). Mesuré : la couverture des responsables par palier passait de
 * **72 secondes** à moins d'une seconde avec l'index.
 *
 * `jobs.uuid` (1 918 lignes) est dans le même cas et sert la répartition par profession.
 *
 * **Index SIMPLE et non UNIQUE, délibérément.** L'unicité est bien vérifiée en base locale
 * (0 doublon), mais un `UNIQUE` ferait **échouer la migration en production** si une seule
 * ligne historique dérogeait - pour un gain nul ici : l'objet est la performance de jointure,
 * pas la contrainte d'intégrité. Poser l'unicité est une décision séparée, à prendre après
 * un contrôle sur la base de production.
 *
 * Additive, idempotente (contrôle d'existence avant création) et réversible. Aucune donnée
 * touchée, aucun comportement applicatif modifié.
 */
export class AddMembersUuidIndex1783600000000 implements MigrationInterface {
  name = 'AddMembersUuidIndex1783600000000';

  private async aIndex(qr: QueryRunner, table: string, index: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, index],
    );
    return r.length > 0;
  }

  private async aTable(qr: QueryRunner, table: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (
      (await this.aTable(qr, 'members')) &&
      !(await this.aIndex(qr, 'members', 'IDX_members_uuid'))
    ) {
      await qr.query('CREATE INDEX `IDX_members_uuid` ON `members` (`uuid`)');
    }
    if (
      (await this.aTable(qr, 'jobs')) &&
      !(await this.aIndex(qr, 'jobs', 'IDX_jobs_uuid'))
    ) {
      await qr.query('CREATE INDEX `IDX_jobs_uuid` ON `jobs` (`uuid`)');
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.aIndex(qr, 'members', 'IDX_members_uuid')) {
      await qr.query('DROP INDEX `IDX_members_uuid` ON `members`');
    }
    if (await this.aIndex(qr, 'jobs', 'IDX_jobs_uuid')) {
      await qr.query('DROP INDEX `IDX_jobs_uuid` ON `jobs`');
    }
  }
}
