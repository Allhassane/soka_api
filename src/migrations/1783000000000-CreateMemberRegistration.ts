import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Validation à deux niveaux des enregistrements de membres (module `membres`).
 *
 * - `member_registrations` : le **dossier** déposé à la saisie. Il porte le formulaire tel quel
 *   (`payload` JSON), les deux ancres (district / chapitre) et les deux décisions.
 *
 * ⚠️ **Aucune ligne n'est créée dans `members` avant la validation finale** : c'est la décision
 * structurante de la spécification (`docs/VALIDATION-MEMBRES.md` §3). Conséquence directe ici :
 * cette migration ne touche **aucune donnée existante** et ne demande **aucune reprise** des
 * 7 950 membres en base.
 *
 * Conventions reprises de `1782500000000-CreateMemberTransfer` :
 * - **Pas de contrainte FK** - le projet joint partout sur les colonnes `*_uuid` à la main.
 * - **Pas de `DEFAULT (UUID())`** - blocage binlog STATEMENT déjà rencontré sur cette base ;
 *   l'uuid est généré par le hook `@BeforeInsert` de l'entité.
 * - **Collation `utf8mb4_unicode_ci`** - sinon les jointures manuelles sur `members.uuid` /
 *   `structures.uuid` se dégradent.
 *
 * ⚠️ R10 (« un seul dossier en attente par téléphone ») n'est PAS un index : MySQL n'a pas
 * d'index unique partiel et la condition porte sur `status`. C'est une garde applicative, comme
 * R4 côté transfert.
 *
 * ⚠️ **Second effet, volontaire : l'index unique sur `members.matricule`.** Le matricule est
 * dérivé de `MAX(id) + 1` (`member.service.ts`) et la colonne n'a **aucun index** (relevé le
 * 2026-08-05 : seul `IDX_members_phone` existe, non unique). Tant que les créations s'étalaient
 * sur la journée de saisie, la collision restait théorique ; avec la validation, elles arrivent
 * **en rafale**. On répare donc ici plutôt que « plus tard, séparément ».
 */
export class CreateMemberRegistration1783000000000 implements MigrationInterface {
  name = 'CreateMemberRegistration1783000000000';

  private async hasTable(qr: QueryRunner, table: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [table],
    );
    return r.length > 0;
  }

  private async hasIndex(
    qr: QueryRunner,
    table: string,
    index: string,
  ): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
      [table, index],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    if (!(await this.hasTable(qr, 'member_registrations'))) {
      await qr.query(`
        CREATE TABLE \`member_registrations\` (
          \`id\` INT NOT NULL AUTO_INCREMENT,
          \`uuid\` CHAR(36) NOT NULL,
          \`status\` ENUM('EN_ATTENTE_DISTRICT','EN_ATTENTE_CHAPITRE','VALIDEE','REFUSEE','ANNULEE')
            NOT NULL DEFAULT 'EN_ATTENTE_DISTRICT',
          \`payload\` JSON NOT NULL,
          \`lastname\` VARCHAR(100) NULL,
          \`firstname\` VARCHAR(100) NULL,
          \`phone\` VARCHAR(30) NULL,
          -- Nullable : un is_admin peut créer un membre sans structure (les non-admins non).
          \`structure_uuid\` CHAR(36) NULL,
          \`district_uuid\` CHAR(36) NULL,
          \`chapitre_uuid\` CHAR(36) NULL,
          \`submitted_by_user_uuid\` CHAR(36) NOT NULL,
          \`submitted_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`district_decision\` ENUM('EN_ATTENTE','APPROUVEE','REFUSEE','ACQUISE','SANS_OBJET')
            NOT NULL DEFAULT 'EN_ATTENTE',
          \`district_decided_by_user_uuid\` CHAR(36) NULL,
          \`district_decided_at\` DATETIME(6) NULL,
          \`district_by_delegation\` TINYINT(1) NOT NULL DEFAULT 0,
          \`chapitre_decision\` ENUM('EN_ATTENTE','APPROUVEE','REFUSEE','ACQUISE','SANS_OBJET')
            NOT NULL DEFAULT 'EN_ATTENTE',
          \`chapitre_decided_by_user_uuid\` CHAR(36) NULL,
          \`chapitre_decided_at\` DATETIME(6) NULL,
          \`chapitre_by_delegation\` TINYINT(1) NOT NULL DEFAULT 0,
          \`refusal_level\` ENUM('DISTRICT','CHAPITRE') NULL,
          \`refusal_comment\` TEXT NULL,
          \`resumed_from_uuid\` CHAR(36) NULL,
          \`member_uuid\` CHAR(36) NULL,
          \`validated_at\` DATETIME(6) NULL,
          \`admin_uuid\` CHAR(36) NULL,
          \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
          \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
          \`deleted_at\` DATETIME(6) NULL,
          PRIMARY KEY (\`id\`),
          UNIQUE INDEX \`UQ_member_registrations_uuid\` (\`uuid\`),
          INDEX \`IDX_member_registrations_district\` (\`status\`, \`district_uuid\`),
          INDEX \`IDX_member_registrations_chapitre\` (\`status\`, \`chapitre_uuid\`),
          INDEX \`IDX_member_registrations_phone\` (\`phone\`),
          INDEX \`IDX_member_registrations_submitter\` (\`submitted_by_user_uuid\`),
          INDEX \`IDX_member_registrations_member\` (\`member_uuid\`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    }

    // ── Index unique sur `members.matricule` ──
    // Posé seulement si la colonne est déjà cohérente. Un doublon préexistant ferait échouer la
    // migration **et bloquerait tout le déploiement** pour une dette qui n'est pas la nôtre :
    // on trace et on passe. (Relevé le 2026-08-05 : 0 doublon.)
    if (!(await this.hasIndex(qr, 'members', 'UQ_members_matricule'))) {
      const [{ doublons }] = await qr.query(`
        SELECT COUNT(*) AS doublons FROM (
          SELECT \`matricule\` FROM \`members\`
           WHERE \`matricule\` IS NOT NULL AND \`deleted_at\` IS NULL
           GROUP BY \`matricule\` HAVING COUNT(*) > 1
        ) t
      `);

      if (Number(doublons) === 0) {
        await qr.query(
          'CREATE UNIQUE INDEX `UQ_members_matricule` ON `members` (`matricule`)',
        );
      } else {
        console.warn(
          `[CreateMemberRegistration] ${doublons} matricule(s) en doublon : index unique NON posé. ` +
            `Dédoublonner puis rejouer : CREATE UNIQUE INDEX UQ_members_matricule ON members (matricule).`,
        );
      }
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    if (await this.hasIndex(qr, 'members', 'UQ_members_matricule')) {
      await qr.query('DROP INDEX `UQ_members_matricule` ON `members`');
    }
    if (await this.hasTable(qr, 'member_registrations')) {
      await qr.query('DROP TABLE `member_registrations`');
    }
  }
}
