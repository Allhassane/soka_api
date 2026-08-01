import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

/**
 * Rend au rôle **RESPONSABLE** les 12 lectures de référentiels dont dépend le formulaire de
 * création / édition d'un membre.
 *
 * **Le constat** (audit du 2026-08-01, `AUDIT-PERMISSIONS-2026-08-01.md` §H1) : RESPONSABLE porte
 * `membres_ajouter_un_membre` et `membres_modifier_un_membre` (status 1) mais **aucune** des
 * lectures que le formulaire consomme - civilité, situation matrimoniale, pays, localité,
 * formation, métier, département, division, niveau, responsabilité, accessoires, ville
 * d'organisation. `hooks/useFormQueries.ts` les appelle toutes, `services/membre.ts`
 * (`loadReferenceData`) échoue **silencieusement** en `Promise.allSettled` : les listes déroulantes
 * reviennent vides, sans le moindre message. La création d'un membre est donc **impossible** pour
 * les 3 343 comptes responsables, alors qu'ils en ont le droit nommé.
 *
 * Ce n'est pas un trou de conception : `1782800500000-AlignMenuAndRoutePermissions` prévoyait déjà
 * cette implication et **a été jouée**. L'état actuel est une régression de configuration
 * postérieure (octroi de menu ou seed rejoué par-dessus).
 *
 * ⚠️ **`structures_voir` n'est PAS dans cette migration**, bien qu'il manque au même formulaire :
 * il ouvre aussi `GET /structure` et `GET /structure/tree`, deux routes **sans contrôle de
 * périmètre**. Il fait l'objet d'une migration séparée (`1782801200000`) pour qu'il puisse être
 * arbitré - et déployé - indépendamment. Sans lui, la **cascade de structures reste bloquée** :
 * cette migration seule ne suffit donc pas à rendre la création de membre fonctionnelle.
 *
 * **PÉRIMÈTRE STRICT.** Un seul rôle (`responsable`), 12 slugs nommés, une seule colonne
 * (`status`). Aucun autre rôle, aucune autre permission, aucune purge, aucun seed. Elle
 * n'**ouvre** que des droits : elle ne peut fermer aucun accès existant.
 *
 * **IDEMPOTENTE** : l'UPDATE ne cible que les lignes à `status = 0`, l'INSERT est conditionné à
 * l'absence de ligne. Rejouée, elle ne fait rien.
 *
 * ⚠️ **Effet à l'écran seulement après RECONNEXION** : `global_permissions` est posé au login.
 * Côté API l'effet arrive en moins de 30 s (cache de `EffectivePermissionsService`).
 *
 * ⚠️ Aucun `DEFAULT (UUID())` : uuid généré côté Node (blocage binlog STATEMENT déjà rencontré
 * sur cette base). `role_id` / `permission_id` écrits à **0**, comme toutes les lignes existantes -
 * y mettre une vraie valeur rendrait vraie la jointure `rp.role_id = ur.role_id` de
 * `permission.service.ts` et accorderait **toutes les permissions de tous les rôles**.
 */
export class GrantResponsableReferentialReads1782801100000
  implements MigrationInterface
{
  name = 'GrantResponsableReferentialReads1782801100000';

  private readonly ROLE = 'responsable';

  /** Les 12 lectures appelées par `useFormQueries`, hors `structures_voir` (cf. en-tête). */
  private readonly SLUGS = [
    'civilites_voir',
    'situations_matrimoniales_voir',
    'pays_voir',
    'villes_voir',
    'formations_voir',
    'metiers_voir',
    'departements_voir',
    'divisions_voir',
    'niveaux_voir',
    'responsabilites_voir',
    'accessoires_voir',
    'villes_organisation_voir',
  ];

  public async up(qr: QueryRunner): Promise<void> {
    const roleUuid = await this.uuidDuRole(qr);
    if (!roleUuid) return;

    let crees = 0;
    let ouverts = 0;
    const absents: string[] = [];

    for (const slug of this.SLUGS) {
      const permUuid = await this.uuidDeLaPermission(qr, slug);
      if (!permUuid) {
        absents.push(slug);
        continue;
      }

      const lignes: Array<{ id: number }> = await qr.query(
        'SELECT `id` FROM `roles_permissions` WHERE `role_uuid` = ? AND `permission_uuid` = ? LIMIT 1',
        [roleUuid, permUuid],
      );

      if (lignes.length === 0) {
        // Pas de ligne : sans elle, la case reste **incochable** dans Paramètres → Rôles
        // (`findGlobalPermissions` renvoie `role_permission_uuid: null`).
        await qr.query(
          'INSERT INTO `roles_permissions` (`uuid`, `role_uuid`, `permission_uuid`, `status`, `role_id`, `permission_id`) VALUES (?, ?, ?, 1, 0, 0)',
          [randomUUID(), roleUuid, permUuid],
        );
        crees++;
      } else {
        const res = await qr.query(
          'UPDATE `roles_permissions` SET `status` = 1 WHERE `role_uuid` = ? AND `permission_uuid` = ? AND `status` = 0',
          [roleUuid, permUuid],
        );
        if (res?.affectedRows > 0) ouverts++;
      }
    }

    console.log(
      `[${this.name}] RESPONSABLE : ${ouverts} droit(s) ouvert(s), ${crees} ligne(s) créée(s)` +
        (absents.length ? ` ; ${absents.length} slug(s) absent(s) de cette base, ignoré(s) : ${absents.join(', ')}` : ''),
    );
  }

  /**
   * Remet les 12 droits à `status = 0` pour le seul rôle RESPONSABLE.
   *
   * ⚠️ Les lignes créées par `up()` ne sont **pas supprimées**, volontairement : une ligne à 0 est
   * équivalente à une ligne absente pour l'autorisation, mais elle garde la case **cochable** dans
   * l'écran des rôles. La supprimer rendrait le droit inaccessible à l'interface.
   */
  public async down(qr: QueryRunner): Promise<void> {
    const roleUuid = await this.uuidDuRole(qr);
    if (!roleUuid) return;

    await qr.query(
      `UPDATE \`roles_permissions\` rp
         JOIN \`permissions\` p ON p.\`uuid\` = rp.\`permission_uuid\`
          SET rp.\`status\` = 0
        WHERE rp.\`role_uuid\` = ? AND p.\`slug\` IN (?)`,
      [roleUuid, this.SLUGS],
    );
  }

  private async uuidDuRole(qr: QueryRunner): Promise<string | null> {
    // Résolu par SLUG, jamais en dur : les uuid des rôles peuvent différer d'un environnement
    // à l'autre.
    const roles: Array<{ uuid: string }> = await qr.query(
      'SELECT `uuid` FROM `roles` WHERE `slug` = ? AND `deleted_at` IS NULL LIMIT 1',
      [this.ROLE],
    );
    const uuid = roles?.[0]?.uuid ?? null;
    if (!uuid) {
      // Ne jamais faire échouer le démarrage de l'API pour un octroi de droit.
      console.warn(`[${this.name}] rôle « ${this.ROLE} » introuvable : migration sans effet.`);
    }
    return uuid;
  }

  private async uuidDeLaPermission(
    qr: QueryRunner,
    slug: string,
  ): Promise<string | null> {
    const perms: Array<{ uuid: string }> = await qr.query(
      'SELECT `uuid` FROM `permissions` WHERE `slug` = ? LIMIT 1',
      [slug],
    );
    return perms?.[0]?.uuid ?? null;
  }
}
