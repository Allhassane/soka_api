import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

/**
 * Invariant : **tout utilisateur porte au moins une ligne dans `user_roles`.**
 *
 * Cette migration rattrape les comptes déjà en base qui n'en ont aucune ; les comptes créés
 * ensuite sont couverts par `UserDefaultRoleSubscriber` (hook `afterInsert` sur `User`).
 *
 * Pourquoi une migration et pas seulement `scripts/seed-user-roles.js` : ce script n'a été joué
 * que sur la base **locale**. `migrationsRun: true` exécute celle-ci au démarrage de l'API, donc
 * **la prod converge sans intervention manuelle** - sans quoi la fusion des droits au login
 * n'aurait aucune source pour les comptes non semés, et tout le monde se retrouverait sans droits.
 *
 * Précédence du rôle attribué (identique à `scripts/seed-user-roles.js`) :
 *   1. `users.is_admin = 1`               → ADMINISTRATEUR
 *   2. le membre porte ≥ 1 responsabilité → le rôle de sa responsabilité la plus haute
 *   3. sinon                              → MEMBRE
 *
 * ⚠️ `user_id` / `role_id` sont laissés à **NULL** : FK numériques héritées, non alimentées (les
 * 7 676 lignes existantes sont à NULL). Y écrire une valeur rendrait vraie la jointure
 * `ur.role_id = rp.role_id` de `permission.service.ts` alors que `roles_permissions.role_id`
 * vaut 0 partout ⇒ fuite de toutes les permissions de tous les rôles.
 *
 * ⚠️ Aucun `DEFAULT (UUID())` : uuid générés côté Node (blocage binlog STATEMENT déjà rencontré).
 *
 * IDEMPOTENTE : ne cible que les utilisateurs sans AUCUNE ligne. Rejouée, elle ne fait rien.
 * NON DESTRUCTIVE : aucune ligne existante n'est lue en écriture, modifiée ni supprimée.
 */
export class BackfillUserRoles1782800200000 implements MigrationInterface {
  name = 'BackfillUserRoles1782800200000';

  /** Insertion par lots : la prod compte ~7 700 comptes, un INSERT géant serait fragile. */
  private readonly LOT = 500;

  public async up(qr: QueryRunner): Promise<void> {
    // Rôles socles. Absents (base vierge) ⇒ on sort sans rien faire : `RoleService.onModuleInit`
    // les crée sous RUN_SEEDS, et la migration pourra être rejouée telle quelle.
    const roles: Array<{ slug: string; uuid: string }> = await qr.query(
      "SELECT `slug`, `uuid` FROM `roles` WHERE `slug` IN ('administrateur', 'membre') AND `deleted_at` IS NULL",
    );
    const parSlug = new Map(roles.map((r) => [r.slug, r.uuid]));
    const admin = parSlug.get('administrateur');
    const membre = parSlug.get('membre');
    if (!admin || !membre) return;

    // Une seule ligne par utilisateur : le rôle de la responsabilité est pris par sous-requête
    // scalaire `LIMIT 1` (et non par jointure, qui multiplierait les lignes).
    // `levels.order` : 0 = NATIONAL … 7 = SOUS_GROUPE ⇒ le plus petit est le plus haut.
    const cibles: Array<{ uuid: string; role_uuid: string }> = await qr.query(
      `SELECT u.uuid AS uuid,
              CASE
                WHEN u.is_admin = 1 THEN ?
                ELSE COALESCE((
                  SELECT r.role_uuid
                    FROM member_responsibilities mr
                    INNER JOIN responsibilities r ON r.uuid = mr.responsibility_uuid
                    LEFT JOIN levels l ON l.uuid = r.level_uuid
                   WHERE mr.member_uuid = u.member_uuid
                     AND mr.deleted_at IS NULL
                     AND r.deleted_at IS NULL
                     AND r.role_uuid IS NOT NULL
                   ORDER BY COALESCE(l.\`order\`, 999) ASC
                   LIMIT 1
                ), ?)
              END AS role_uuid
         FROM users u
        WHERE u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_uuid = u.uuid)`,
      [admin, membre],
    );

    if (cibles.length === 0) return;

    // Le rôle d'une responsabilité peut avoir été supprimé entre-temps : repli sur MEMBRE.
    const connus = new Set<string>(
      (
        await qr.query('SELECT `uuid` FROM `roles` WHERE `deleted_at` IS NULL')
      ).map((r: { uuid: string }) => r.uuid),
    );

    for (let i = 0; i < cibles.length; i += this.LOT) {
      const lot = cibles.slice(i, i + this.LOT);
      const valeurs: string[] = [];
      const placeholders = lot
        .map((c) => {
          const roleUuid =
            c.role_uuid && connus.has(c.role_uuid) ? c.role_uuid : membre;
          valeurs.push(randomUUID(), c.uuid, roleUuid);
          return '(?, ?, ?, 1, NOW(6), NOW(6))';
        })
        .join(', ');

      await qr.query(
        'INSERT INTO `user_roles` (`uuid`, `user_uuid`, `role_uuid`, `is_active`, `created_at`, `updated_at`) VALUES ' +
          placeholders,
        valeurs,
      );
    }
  }

  public async down(): Promise<void> {
    // Volontairement **sans effet**. Les lignes créées ici sont indiscernables de celles semées
    // par `scripts/seed-user-roles.js` : les supprimer priverait des comptes légitimes de tout
    // rôle - donc de tout droit - pour annuler un simple rattrapage de données.
    // Pour défaire ce backfill, cibler explicitement les comptes concernés en SQL.
  }
}
