import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ouvre les permissions de **LECTURE** par défaut, juste après la pose de `@RequirePermissions`
 * sur 248 routes qui n'étaient jusque-là protégées par rien.
 *
 * Sans cette migration, la mise en application refermerait l'application sur les non-admins :
 * toutes les permissions du catalogue naissent **décochées**, donc un RESPONSABLE se prendrait
 * un 403 sur la moindre liste déroulante (villes, civilités, niveaux…).
 *
 * Politique retenue - **lecture seulement**, jamais d'écriture :
 *  - **MEMBRE**       → `_voir` des **Référentiels** (ce que ses propres formulaires exigent) ;
 *  - **RESPONSABLE**  → `_voir` des **Référentiels, Membres, Structure, Activités,
 *                        Statistiques** - son périmètre opérationnel, hors administration.
 *                        Ce qu'il voit reste borné par le périmètre hiérarchique, qui est un
 *                        contrôle distinct et indépendant.
 *
 * **Créer / modifier / supprimer restent fermés** pour tout le monde sauf ADMINISTRATEUR :
 * c'est le comportement demandé (« limiter l'accès aux rôles qui n'ont pas la permission »).
 * L'administrateur ouvre ensuite au cas par cas depuis Paramètres → Rôles.
 *
 * Les rôles créés à la main (ex. JOURNAL) ne sont **pas** touchés : leur configuration
 * appartient à l'administrateur.
 *
 * IDEMPOTENTE : ne coche que des liens à 0, ne décoche jamais rien, ne crée aucune ligne.
 * `down()` est volontairement **SANS EFFET** (cf. sa propre documentation) : impossible de
 * distinguer ce que `up()` a coché de ce qu'un administrateur a coché depuis.
 */
export class GrantDefaultReadPermissions1782800400000
  implements MigrationInterface
{
  name = 'GrantDefaultReadPermissions1782800400000';

  private readonly politique: Array<{ slug: string; modules: string[] }> = [
    { slug: 'membre', modules: ['Référentiels'] },
    {
      slug: 'responsable',
      modules: [
        'Référentiels',
        'Membres',
        'Structure',
        'Activités',
        'Statistiques',
      ],
    },
  ];

  public async up(qr: QueryRunner): Promise<void> {
    for (const { slug, modules } of this.politique) {
      await qr.query(
        `UPDATE roles_permissions rp
           JOIN roles r        ON r.uuid = rp.role_uuid
           JOIN permissions p  ON p.uuid = rp.permission_uuid
           JOIN modules m      ON m.uuid = p.module_uuid
            SET rp.status = 1
          WHERE r.slug = ?
            AND rp.status = 0
            AND p.slug LIKE '%\\_voir'
            AND m.name IN (?)`,
        [slug, modules],
      );
    }
  }

  public async down(): Promise<void> {
    /**
     * Volontairement **SANS EFFET**.
     *
     * La première version décochait toutes les permissions `_voir` des modules ciblés - pas
     * seulement celles que `up()` avait cochées. Elle détruisait donc la configuration faite
     * à la main par l'administrateur depuis, et refermait des écrans en état de marche.
     * Décocher une permission ne « répare » rien : pour retirer un droit, le faire depuis
     * Paramètres → Rôles, où l'intention est explicite.
     */
  }
}
