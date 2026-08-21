import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * **Journal des tentatives de connexion** (`login_logs`) - demande du 2026-08-19.
 *
 * Voir `auth/entities/login-log.entity.ts` pour le pourquoi. En deux mots : `users.is_connected`
 * est un booléen posé UNE fois dans la vie du compte, il ne dit ni quand ni combien de fois ;
 * aucun indicateur d'usage n'était donc calculable, et un balayage de mots de passe à 4 chiffres
 * était invisible.
 *
 * ⚠️ **Aucun effet rétroactif** : l'historique commence le jour où l'API écrit dedans. C'est la
 * raison pour laquelle cette table est livrée AVANT les écrans qui la lisent.
 *
 * **Collation.** `user_uuid` est en `utf8mb4_unicode_ci`, comme `users.uuid` : sans ça, la
 * jointure du module Statistiques comparerait du `latin1` à de l'`utf8mb4` et perdrait l'index
 * (piège récurrent du schéma, cf. CONTEXT §9).
 *
 * **Aucune clé étrangère**, et c'est délibéré : une tentative sur un numéro INCONNU n'a pas de
 * compte à référencer (`user_uuid` NULL) - or c'est exactement la ligne qui révèle un balayage.
 * Une FK la rendrait impossible à écrire.
 *
 * Idempotente (`CREATE TABLE IF NOT EXISTS`) et réversible.
 */
export class CreateLoginLogs1783500000000 implements MigrationInterface {
  name = 'CreateLoginLogs1783500000000';

  public async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      CREATE TABLE IF NOT EXISTS \`login_logs\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`user_uuid\` CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        \`identifier\` VARCHAR(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL,
        \`outcome\` VARCHAR(32) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL,
        \`ip\` VARCHAR(45) NULL,
        \`user_agent\` VARCHAR(255) NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`IDX_login_logs_created_at\` (\`created_at\`),
        INDEX \`IDX_login_logs_user_uuid\` (\`user_uuid\`),
        INDEX \`IDX_login_logs_outcome_created\` (\`outcome\`, \`created_at\`),
        INDEX \`IDX_login_logs_ip_created\` (\`ip\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(`DROP TABLE IF EXISTS \`login_logs\``);
  }
}
