import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index du chemin critique de résolution des droits.
 *
 * Depuis que `PermissionsGuard` résout les permissions en base, cette requête est sur le chemin
 * de **chaque requête HTTP** (amortie par un cache de 30 s par utilisateur). Mesurée à
 * **2 121 ms** : `user_roles` (7 676 lignes) n'avait aucun index sur `user_uuid`, et
 * `roles_permissions` (840 lignes) aucun index du tout - le plan montrait un balayage complet
 * de `user_roles` en DEPENDENT SUBQUERY.
 *
 * `member_responsibilities` et `committee_members` étaient déjà indexées sur `member_uuid` :
 * seules les deux tables ci-dessous manquaient.
 *
 * ADDITIVE, IDEMPOTENTE, réversible. Aucune donnée touchée.
 */
export class AddPermissionResolutionIndexes1782800700000
  implements MigrationInterface
{
  name = 'AddPermissionResolutionIndexes1782800700000';

  private readonly index: Array<{ table: string; nom: string; colonnes: string }> = [
    { table: 'user_roles', nom: 'IDX_user_roles_user_uuid', colonnes: '`user_uuid`' },
    { table: 'roles_permissions', nom: 'IDX_roles_permissions_role_uuid', colonnes: '`role_uuid`' },
    { table: 'roles_permissions', nom: 'IDX_roles_permissions_permission_uuid', colonnes: '`permission_uuid`' },
  ];

  private async existe(qr: QueryRunner, table: string, nom: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.STATISTICS
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, nom],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    for (const { table, nom, colonnes } of this.index) {
      if (await this.existe(qr, table, nom)) continue;
      await qr.query(`CREATE INDEX \`${nom}\` ON \`${table}\` (${colonnes})`);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    for (const { table, nom } of [...this.index].reverse()) {
      if (!(await this.existe(qr, table, nom))) continue;
      await qr.query(`DROP INDEX \`${nom}\` ON \`${table}\``);
    }
  }
}
