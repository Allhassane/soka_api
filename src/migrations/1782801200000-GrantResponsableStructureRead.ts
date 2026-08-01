import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

/**
 * Rend `structures_voir` au rôle **RESPONSABLE**.
 *
 * ⚠️ **MIGRATION À ARBITRER AVANT DÉPLOIEMENT - elle est volontairement séparée de
 * `1782801100000-GrantResponsableReferentialReads` pour cette raison.** Si l'arbitrage est
 * « non », il suffit de supprimer ce fichier avant de commiter : les 12 autres droits partent
 * sans lui.
 *
 * **Pourquoi il le faut** (audit du 2026-08-01, §H1/H2) : `structures_voir` garde **14 routes**,
 * dont `GET /structure/childrens/:uuid` qui alimente la **cascade Région → Sous-groupe** de tous
 * les formulaires. Sans lui, un RESPONSABLE ne peut ni créer un membre ni corriger son
 * rattachement, malgré `membres_ajouter_un_membre`. Les 12 référentiels de la migration
 * précédente ne suffisent pas : la cascade reste bloquée.
 *
 * **⚠️ CE QUE ÇA OUVRE EN PLUS, et qu'il faut accepter en connaissance de cause.** Le même slug
 * garde aussi `GET /structure` (liste complète) et `GET /structure/tree`, **qui n'ont aucun
 * contrôle de périmètre au contrôleur**. Un responsable pourra donc lire l'arborescence entière
 * de l'organisation - **des noms de structures, aucune donnée de membre** (les routes qui portent
 * des membres sont gardées séparément et bornées par `assertTargetWithinPerimeter`).
 *
 * **Ce n'est pas une ouverture nouvelle, c'est une restauration.** `RECETTE-2026-07-31.md §F2`
 * montre un RESPONSABLE réel obtenant **200** sur `/structure/childrens/*` le 2026-07-31 : le
 * droit lui a été retiré après cette date. Cette migration remet l'état du 31/07.
 *
 * **La suite recommandée, hors périmètre de cette migration** : borner `GET /structure` et
 * `GET /structure/tree` par `assertTargetWithinPerimeter`, puis remplacer `structures_voir` par
 * les slugs propriétaires de chaque usage (§H2 du rapport). Tant que ce n'est pas fait, ce droit
 * reste plus large que son libellé ne le laisse croire.
 *
 * **PÉRIMÈTRE STRICT.** Un rôle, un slug, une colonne. Idempotente. Elle n'ouvre qu'un droit et
 * n'en ferme aucun. Mêmes conventions que la migration précédente : uuid généré côté Node,
 * `role_id`/`permission_id` à 0, rôle résolu par slug.
 *
 * ⚠️ **Effet à l'écran seulement après RECONNEXION.**
 */
export class GrantResponsableStructureRead1782801200000
  implements MigrationInterface
{
  name = 'GrantResponsableStructureRead1782801200000';

  private readonly ROLE = 'responsable';
  private readonly SLUG = 'structures_voir';

  public async up(qr: QueryRunner): Promise<void> {
    const roleUuid = await this.uuidDuRole(qr);
    if (!roleUuid) return;

    const perms: Array<{ uuid: string }> = await qr.query(
      'SELECT `uuid` FROM `permissions` WHERE `slug` = ? LIMIT 1',
      [this.SLUG],
    );
    const permUuid = perms?.[0]?.uuid;
    if (!permUuid) {
      console.warn(
        `[${this.name}] permission « ${this.SLUG} » absente de cette base : migration sans effet.`,
      );
      return;
    }

    const lignes: Array<{ id: number }> = await qr.query(
      'SELECT `id` FROM `roles_permissions` WHERE `role_uuid` = ? AND `permission_uuid` = ? LIMIT 1',
      [roleUuid, permUuid],
    );

    if (lignes.length === 0) {
      await qr.query(
        'INSERT INTO `roles_permissions` (`uuid`, `role_uuid`, `permission_uuid`, `status`, `role_id`, `permission_id`) VALUES (?, ?, ?, 1, 0, 0)',
        [randomUUID(), roleUuid, permUuid],
      );
      console.log(`[${this.name}] RESPONSABLE : ligne créée pour ${this.SLUG}.`);
    } else {
      const res = await qr.query(
        'UPDATE `roles_permissions` SET `status` = 1 WHERE `role_uuid` = ? AND `permission_uuid` = ? AND `status` = 0',
        [roleUuid, permUuid],
      );
      console.log(
        `[${this.name}] RESPONSABLE : ${this.SLUG} ${res?.affectedRows > 0 ? 'ouvert' : 'déjà ouvert'}.`,
      );
    }
  }

  /** Remet `structures_voir` à 0 pour le seul RESPONSABLE (la ligne est conservée, cf. 1782801100000). */
  public async down(qr: QueryRunner): Promise<void> {
    const roleUuid = await this.uuidDuRole(qr);
    if (!roleUuid) return;

    await qr.query(
      `UPDATE \`roles_permissions\` rp
         JOIN \`permissions\` p ON p.\`uuid\` = rp.\`permission_uuid\`
          SET rp.\`status\` = 0
        WHERE rp.\`role_uuid\` = ? AND p.\`slug\` = ?`,
      [roleUuid, this.SLUG],
    );
  }

  private async uuidDuRole(qr: QueryRunner): Promise<string | null> {
    const roles: Array<{ uuid: string }> = await qr.query(
      'SELECT `uuid` FROM `roles` WHERE `slug` = ? AND `deleted_at` IS NULL LIMIT 1',
      [this.ROLE],
    );
    const uuid = roles?.[0]?.uuid ?? null;
    if (!uuid) {
      console.warn(`[${this.name}] rôle « ${this.ROLE} » introuvable : migration sans effet.`);
    }
    return uuid;
  }
}
