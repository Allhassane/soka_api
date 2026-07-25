import { randomUUID } from 'crypto';
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `membres_gerer_membres_comite` - permission qui gouverne l'onglet « Comité » de la fiche membre :
 * ajouter un membre à un comité dont on est responsable, et l'en retirer
 * (`POST /comite/:uuid/members`, `DELETE /comite/:uuid/members/:memberUuid`).
 *
 * Jusqu'ici ces deux routes n'étaient gardées que par `CommitteeService.canManage()` - responsable
 * du comité **ou** `is_admin`. Il n'existait donc **aucun moyen de restreindre la fonctionnalité**
 * depuis Paramètres → Rôles : désigner quelqu'un responsable d'un comité lui donnait
 * automatiquement le droit d'y affecter des membres. Cette migration crée le slug manquant ; la
 * garde `canManage()` reste en place et s'y ajoute (permission **ET** responsable du comité).
 *
 * 🔒 `permissions` et `roles_permissions` sont des tables PARTAGÉES entre tous les modules : cette
 * migration n'y AJOUTE que des lignes, elle n'en modifie ni n'en supprime aucune autre.
 *
 * Conventions reprises de `1782600000000-AddMemberUpdatePermission` :
 *  - le `module_uuid` est **résolu** depuis une permission existante plutôt que codé en dur
 *    (portable d'un environnement à l'autre) - ici module « Membres », comme les autres
 *    permissions d'action sur un membre ;
 *  - aucun `UUID()` SQL - blocage binlog STATEMENT déjà rencontré sur cette base : les uuid sont
 *    générés côté Node et passés en paramètres.
 *
 * ⚠️ **Rattachement aux TROIS rôles, pas seulement à celui qu'on veut autoriser.** Sans ligne
 * `roles_permissions`, `RoleService.findGlobalPermissions` renvoie `role_permission_uuid: null` et
 * la case à cocher de Paramètres → Rôles échoue en « Aucun élément trouvé » (c'est exactement le
 * trou que comble `seed:sync-role-permissions`). On crée donc le lien pour chaque rôle, avec le
 * `status` voulu - l'administration peut ensuite cocher/décocher n'importe lequel.
 *
 * Statuts choisis : `RESPONSABLE` et `ADMINISTRATEUR` à **1** (comportement identique à avant la
 * migration : aucune régression au déploiement), `MEMBRE` à **0**. Restreindre = décocher la case.
 * Rappel : les permissions d'un non-admin viennent du rôle porté par sa **responsabilité**
 * (`responsibilities.role_uuid`), toutes pointées sur `RESPONSABLE` - `user_roles` est vide.
 */
export class AddCommitteeMemberManagementPermission1782700000000
  implements MigrationInterface
{
  name = 'AddCommitteeMemberManagementPermission1782700000000';

  private readonly slug = 'membres_gerer_membres_comite';
  private readonly label = 'Gérer les membres de son comité';
  private readonly description =
    "Ajouter un membre à un comité dont on est responsable, ou l'en retirer, depuis l'onglet Comité de la fiche membre";
  /** Permission dont on hérite le module - même famille d'action (module « Membres »). */
  private readonly referenceSlug = 'membres_ajouter_un_membre';
  /** Rôle → statut du lien à la création. */
  private readonly roleStatuses: Array<[string, 0 | 1]> = [
    ['RESPONSABLE', 1],
    ['ADMINISTRATEUR', 1],
    ['MEMBRE', 0],
  ];

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

    for (const [roleName, status] of this.roleStatuses) {
      const role = await qr.query(
        'SELECT `uuid` FROM `roles` WHERE `name` = ? LIMIT 1',
        [roleName],
      );
      const roleUuid: string | undefined = role[0]?.uuid;
      if (!roleUuid) continue; // environnement sans ce rôle : rien à rattacher

      // ⚠️ Pièges vérifiés en base sur cette table :
      //  1. elle s'appelle `roles_permissions` (pluriel des DEUX côtés) ;
      //  2. `role_id` / `permission_id` valent 0 sur toutes les lignes - le lien réel passe par
      //     `role_uuid` / `permission_uuid`, c'est ce que lit `RoleService.findGlobalPermissions` ;
      //  3. elle n'a ni `created_at`/`updated_at` ni `deleted_at`.
      const alreadyLinked = await qr.query(
        'SELECT `id`, `status` FROM `roles_permissions` WHERE `role_uuid` = ? AND `permission_uuid` = ? LIMIT 1',
        [roleUuid, permissionUuid],
      );

      if (alreadyLinked.length > 0) {
        // Rejeu de la migration : on n'active que ce qui doit l'être et on ne DÉSACTIVE jamais un
        // lien existant - le statut peut avoir été changé volontairement depuis l'écran des rôles.
        if (status === 1 && !alreadyLinked[0].status) {
          await qr.query(
            'UPDATE `roles_permissions` SET `status` = 1 WHERE `id` = ?',
            [alreadyLinked[0].id],
          );
        }
        continue;
      }

      await qr.query(
        'INSERT INTO `roles_permissions` (`uuid`, `role_uuid`, `permission_uuid`, `status`, `role_id`, `permission_id`) VALUES (?, ?, ?, ?, 0, 0)',
        [randomUUID(), roleUuid, permissionUuid, status],
      );
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      'DELETE FROM `roles_permissions` WHERE `permission_uuid` IN (SELECT `uuid` FROM `permissions` WHERE `slug` = ?)',
      [this.slug],
    );
    await qr.query('DELETE FROM `permissions` WHERE `slug` = ?', [this.slug]);
  }
}
