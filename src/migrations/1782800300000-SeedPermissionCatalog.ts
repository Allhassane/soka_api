import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';
import { listAllPermissions } from '../permission/permission-manifest';

/**
 * Catalogue exhaustif des permissions de l'application, dérivé du manifeste
 * `src/permission/permission-manifest.ts` (lui-même calqué sur les routes réelles).
 *
 * Écrit dans **DEUX** tables, c'est la règle du projet :
 *  1. `modules`     - un module par regroupement fonctionnel, créé s'il manque ;
 *  2. `permissions` - une ligne par slug, rattachée à son module ;
 *  3. `roles_permissions` - **un lien par (rôle × permission)**. Sans ce lien,
 *     `findGlobalPermissions` renvoie `role_permission_uuid: null` et la case de
 *     Paramètres → Rôles est incochable (« Aucun élément trouvé »).
 *
 * Statut par défaut des liens créés :
 *  - **ADMINISTRATEUR → coché** (l'interface d'un admin doit tout montrer ; l'API, elle,
 *    court-circuite déjà sur `is_admin`) ;
 *  - **tous les autres rôles → décoché**, à l'administrateur de cocher ce qu'il accorde.
 *
 * ⚠️ `role_id` / `permission_id` forcés à **0** : ce sont les valeurs réelles de toutes les
 * lignes existantes ; le lien passe par `role_uuid` / `permission_uuid`.
 * ⚠️ uuid générés côté Node (jamais de `DEFAULT (UUID())`, blocage binlog STATEMENT).
 *
 * IDEMPOTENTE : ne crée que ce qui manque, ne modifie **jamais** un lien déjà existant (donc
 * ne réactive ni ne désactive une permission déjà cochée à la main). Rejouable sans effet.
 * `down()` supprime les permissions du manifeste **absentes** du jeu historique, et leurs liens.
 */
export class SeedPermissionCatalog1782800300000 implements MigrationInterface {
  name = 'SeedPermissionCatalog1782800300000';

  public async up(qr: QueryRunner): Promise<void> {
    const catalogue = listAllPermissions();
    if (catalogue.length === 0) return;

    // ---- 1. Modules ----
    const modulesVoulus = [...new Set(catalogue.map((p) => p.module))];
    const modulesExistants: Array<{ uuid: string; name: string }> = await qr.query(
      'SELECT `uuid`, `name` FROM `modules` WHERE `deleted_at` IS NULL',
    );
    const moduleParNom = new Map(modulesExistants.map((m) => [m.name, m.uuid]));

    for (const nom of modulesVoulus) {
      if (moduleParNom.has(nom)) continue;
      const uuid = randomUUID();
      await qr.query(
        'INSERT INTO `modules` (`uuid`, `name`, `slug`, `status`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, NOW(), NOW())',
        [uuid, nom, this.slugify(nom), 'enable'],
      );
      moduleParNom.set(nom, uuid);
    }

    // ---- 2. Permissions ----
    const permsExistantes: Array<{ uuid: string; slug: string }> = await qr.query(
      'SELECT `uuid`, `slug` FROM `permissions`',
    );
    const permParSlug = new Map(permsExistantes.map((p) => [p.slug, p.uuid]));

    for (const perm of catalogue) {
      if (permParSlug.has(perm.slug)) continue;
      const uuid = randomUUID();
      await qr.query(
        'INSERT INTO `permissions` (`uuid`, `name`, `slug`, `description`, `module_uuid`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [uuid, perm.name, perm.slug, perm.description, moduleParNom.get(perm.module) ?? null],
      );
      permParSlug.set(perm.slug, uuid);
    }

    // ---- 3. Liens rôle × permission ----
    const roles: Array<{ uuid: string; slug: string }> = await qr.query(
      'SELECT `uuid`, `slug` FROM `roles` WHERE `deleted_at` IS NULL',
    );
    if (roles.length === 0) return;

    const liensExistants: Array<{ role_uuid: string; permission_uuid: string }> =
      await qr.query('SELECT `role_uuid`, `permission_uuid` FROM `roles_permissions`');
    const deja = new Set(
      liensExistants.map((l) => `${l.role_uuid}|${l.permission_uuid}`),
    );

    const aInserer: Array<[string, string, string, number]> = [];
    for (const role of roles) {
      const actif = role.slug === 'administrateur' ? 1 : 0;
      for (const perm of catalogue) {
        const permUuid = permParSlug.get(perm.slug);
        if (!permUuid || deja.has(`${role.uuid}|${permUuid}`)) continue;
        aInserer.push([randomUUID(), role.uuid, permUuid, actif]);
      }
    }

    const LOT = 500;
    for (let i = 0; i < aInserer.length; i += LOT) {
      const lot = aInserer.slice(i, i + LOT);
      await qr.query(
        'INSERT INTO `roles_permissions` (`uuid`, `role_uuid`, `permission_uuid`, `status`, `role_id`, `permission_id`) VALUES ' +
          lot.map(() => '(?, ?, ?, ?, 0, 0)').join(', '),
        lot.flat(),
      );
    }
  }

  public async down(): Promise<void> {
    /**
     * Volontairement **SANS EFFET**.
     *
     * La première version datait les permissions « nouvelles » sur `created_at`, en croyant
     * distinguer ce qu'elle avait créé. C'était faux à deux titres : `created_at` est NULL sur
     * une partie des lignes historiques, et plusieurs slugs du manifeste préexistaient au seed.
     * Le revert aurait donc supprimé 11 permissions antérieures et 44 liens, dont 22 actifs -
     * exactement l'inverse de ce que promettait l'en-tête.
     *
     * Un revert sûr supposerait de tracer les uuid créés ; comme aucune de ces permissions n'est
     * destructrice (une permission en trop est au pire une case inutile dans l'écran des rôles),
     * ne rien faire est le comportement correct. Pour en retirer une, passer par une migration
     * dédiée qui la nomme explicitement (modèle : `CleanupPermissionCatalog`).
     */
  }

  private slugify(valeur: string): string {
    return valeur
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/(^_|_$)/g, '');
  }
}
