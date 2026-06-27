import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rattrape les `uuid` manquants (NULL ou chaîne vide) sur les tables de référence
 * utilisées par le formulaire de création de membre.
 *
 * Contexte : la colonne `uuid` de ces tables est `DEFAULT NULL` en base et
 * `synchronize` est OFF, donc le `default: () => '(UUID())'` déclaré sur les entités
 * n'est jamais appliqué. Des lignes importées en masse (typiquement `jobs`) se sont
 * retrouvées avec `uuid = NULL` → impossibles à sélectionner dans les listes du
 * front (le `<SelectItem value={uuid}>` n'a pas de valeur). La génération d'uuid est
 * désormais assurée côté entité via `@BeforeInsert generateUuid()` pour les NOUVELLES
 * lignes ; cette migration répare les lignes EXISTANTES.
 *
 * NON-DESTRUCTIVE et IDEMPOTENTE : ne touche que les lignes dont l'uuid est manquant.
 * Sur une base déjà saine, c'est un no-op. UUID() est évalué par ligne → chaque ligne
 * obtient un identifiant unique. La méthode down() est volontairement vide : on ne peut
 * pas distinguer après coup les uuid générés ici, et les remettre à NULL recasserait
 * les enregistrements.
 */
export class BackfillMissingUuids1782200200000 implements MigrationInterface {
  name = 'BackfillMissingUuids1782200200000';

  private readonly tables = [
    'jobs',
    'formations',
    'cities',
    'organisation_cities',
  ];

  private async hasUuidColumn(
    qr: QueryRunner,
    table: string,
  ): Promise<boolean> {
    const rows = await qr.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = ? AND column_name = 'uuid' LIMIT 1`,
      [table],
    );
    return rows.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    for (const table of this.tables) {
      if (await this.hasUuidColumn(qr, table)) {
        await qr.query(
          `UPDATE \`${table}\` SET \`uuid\` = (UUID())
           WHERE \`uuid\` IS NULL OR \`uuid\` = ''`,
        );
      }
    }
  }

  public async down(): Promise<void> {
    // Non réversible : restaurer les uuid à NULL recasserait les enregistrements.
  }
}
