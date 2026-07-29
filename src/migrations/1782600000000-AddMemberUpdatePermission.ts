import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `membres_modifier_un_membre` - la permission exigée par `PUT /members/:uuid`
 * (`MemberController.update`) **n'a jamais existé en base**.
 *
 * Conséquence mesurée le 2026-07-24 : la modification d'un membre renvoyait `403 « Vous n'avez
 * pas la permission d'effectuer cette action »` pour **tout le monde sauf `is_admin`**, qui
 * court-circuite `PermissionsGuard`. Le front n'affiche aucune garde sur ce slug : le bouton
 * « Modifier » de la fiche membre était visible pour tous les responsables et échouait
 * systématiquement.
 *
 * 🔒 `permissions` et `roles_permissions` sont des tables PARTAGÉES entre tous les modules :
 * cette migration n'y AJOUTE que des lignes, elle n'en modifie ni n'en supprime aucune autre.
 *
 * Conventions reprises de `1782500100000-AddMemberTransferPermissions` :
 *  - le `module_uuid` est **résolu** depuis une permission existante plutôt que codé en dur
 *    (portable d'un environnement à l'autre) ;
 *  - aucun `UUID()` SQL - blocage binlog STATEMENT déjà rencontré sur cette base : les uuid
 *    sont générés côté Node et passés en paramètres.
 *
 * ⚠️ **Différence assumée avec la migration transfert**, qui laissait l'attribution aux rôles à
 * l'administration : ici on rattache aussi la permission au rôle `RESPONSABLE`. Raison - ce
 * n'est pas l'ouverture d'une fonctionnalité nouvelle, c'est la réparation d'un endpoint qui
 * existe depuis toujours et que l'UI expose déjà à tous les responsables. Sans le rattachement,
 * la migration ne changerait rien au symptôme. Rappel : les permissions d'un non-admin viennent
 * du rôle porté par sa **responsabilité** (`responsibilities.role_uuid`), et les 31
 * responsabilités pointent toutes vers `RESPONSABLE` - `user_roles` est vide.
 */
export class AddMemberUpdatePermission1782600000000 implements MigrationInterface {
  name = 'AddMemberUpdatePermission1782600000000';

  private readonly slug = 'membres_modifier_un_membre';
  private readonly label = 'Modifier un membre';
  private readonly description =
    "Modifier la fiche d'un membre situé dans son périmètre (hors changement de district, qui relève du transfert)";
  /** Permission dont on hérite le module - même famille d'action. */
  private readonly referenceSlug = 'membres_ajouter_un_membre';
  private readonly roleName = 'RESPONSABLE';

  public async up(qr: QueryRunner): Promise<void> {
    const existing = await qr.query(
      'SELECT `uuid` FROM `permissions` WHERE `slug` = ? LIMIT 1',
      [this.slug],
    );

    let permissionUuid: string = existing[0]?.uuid;

    if (!permissionUuid) {
      const reference = await qr.query(
        'SELECT `module_uuid` FROM `permissions` WHERE `slug` = ? LIMIT 1',
        [this.referenceSlug],
      );
      permissionUuid = randomUUID();

      await qr.query(
        'INSERT INTO `permissions` (`uuid`, `name`, `slug`, `description`, `module_uuid`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [
          permissionUuid,
          this.label,
          this.slug,
          this.description,
          reference[0]?.module_uuid ?? null,
        ],
      );
    }

    const role = await qr.query(
      'SELECT `uuid` FROM `roles` WHERE `name` = ? LIMIT 1',
      [this.roleName],
    );
    const roleUuid: string | undefined = role[0]?.uuid;
    if (!roleUuid) return; // environnement sans ce rôle : rien à rattacher

    // ⚠️ Trois pièges vérifiés en base sur cette table :
    //  1. elle s'appelle `roles_permissions` (pluriel des DEUX côtés) ;
    //  2. `role_id` / `permission_id` valent 0 sur toutes les lignes - le lien réel passe par
    //     `role_uuid` / `permission_uuid`, c'est ce que lit `RoleService.findGlobalPermissions` ;
    //  3. `status` vaut 0 par défaut alors que `findGlobalPermissions` renvoie
    //     `status: rolePerm.status` et que le front ne garde que `status === true` : une ligne
    //     insérée sans `status = 1` rattacherait la permission tout en la laissant INACTIVE.
    const alreadyLinked = await qr.query(
      'SELECT `id` FROM `roles_permissions` WHERE `role_uuid` = ? AND `permission_uuid` = ? LIMIT 1',
      [roleUuid, permissionUuid],
    );

    if (alreadyLinked.length > 0) {
      // Lien déjà présent mais éventuellement désactivé : on l'active sans rien recréer.
      await qr.query(
        'UPDATE `roles_permissions` SET `status` = 1 WHERE `id` = ?',
        [alreadyLinked[0].id],
      );
      return;
    }

    await qr.query(
      'INSERT INTO `roles_permissions` (`uuid`, `role_uuid`, `permission_uuid`, `status`, `role_id`, `permission_id`) VALUES (?, ?, ?, 1, 0, 0)',
      [randomUUID(), roleUuid, permissionUuid],
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      'DELETE FROM `roles_permissions` WHERE `permission_uuid` IN (SELECT `uuid` FROM `permissions` WHERE `slug` = ?)',
      [this.slug],
    );
    await qr.query('DELETE FROM `permissions` WHERE `slug` = ?', [this.slug]);
  }
}
