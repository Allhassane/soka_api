import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Deux corrections de droits révélées par la vérification adversariale.
 *
 * **① Payer un abonnement ou faire un don était devenu impossible.** La protection des 248
 * routes a posé `abonnements_paiements_creer` sur `POST /subscription-payments` et
 * `dons_paiements_creer` sur `POST /donate-payments`, deux slugs à `status = 0` pour tous les
 * rôles sauf ADMINISTRATEUR. Or ces routes ne sont pas des actes d'administration : c'est
 * l'utilisateur lui-même qui règle sa cotisation depuis l'écran Abonnements/Dons. Avant la
 * protection, elles n'exigeaient **rien**. On accorde donc le droit de payer à tout rôle qui
 * voit déjà l'écran correspondant - même raisonnement que `AlignMenuAndRoutePermissions` :
 * la configuration existante fait foi.
 *
 * **② Le rôle MEMBRE portait des permissions d'ÉCRITURE sur les membres et les transferts**
 * (4 420 comptes). Héritage antérieur à la refonte : la politique d'ouverture ne relisait que
 * les slugs `%_voir` et ne les a donc jamais revus. Un simple membre n'a pas à créer, modifier
 * ou supprimer un membre, ni à initier ou approuver un transfert.
 *
 * ⚠️ On ne touche qu'au rôle `membre` et qu'à ces 6 slugs nommément : aucun autre rôle, aucune
 * autre permission. `down()` rétablit exactement l'inverse des deux opérations.
 */
export class FixPaymentAndMemberGrants1782800800000
  implements MigrationInterface
{
  name = 'FixPaymentAndMemberGrants1782800800000';

  /** slug de menu déjà accordé → droit de payer qui va avec. */
  private readonly paiements: Array<[string, string]> = [
    ['abonnements_voir_menu_abonnements', 'abonnements_paiements_creer'],
    ['donations_voir_menu_donations', 'dons_paiements_creer'],
  ];

  /** Écritures qu'un simple MEMBRE ne doit pas porter. */
  private readonly ecrituresMembre = [
    'membres_ajouter_un_membre',
    'membres_modifier_un_membre',
    'membres_supprimer_un_membre',
    'membres_initier_transfert',
    'membres_approuver_transfert',
    'membres_gerer_membres_comite',
  ];

  public async up(qr: QueryRunner): Promise<void> {
    // ① Le droit de payer suit le droit de voir l'écran.
    for (const [slugMenu, slugPaiement] of this.paiements) {
      await qr.query(
        `UPDATE roles_permissions rp
           JOIN permissions p ON p.uuid = rp.permission_uuid
            SET rp.status = 1
          WHERE p.slug = ?
            AND rp.status = 0
            AND rp.role_uuid IN (
                  SELECT role_uuid FROM (
                    SELECT rp2.role_uuid
                      FROM roles_permissions rp2
                      JOIN permissions p2 ON p2.uuid = rp2.permission_uuid
                     WHERE rp2.status = 1 AND p2.slug = ?
                  ) AS r
                )`,
        [slugPaiement, slugMenu],
      );
    }

    // ② Retrait des écritures au rôle MEMBRE.
    await qr.query(
      `UPDATE roles_permissions rp
         JOIN roles r ON r.uuid = rp.role_uuid
         JOIN permissions p ON p.uuid = rp.permission_uuid
          SET rp.status = 0
        WHERE r.slug = 'membre' AND rp.status = 1 AND p.slug IN (?)`,
      [this.ecrituresMembre],
    );
  }

  public async down(qr: QueryRunner): Promise<void> {
    await qr.query(
      `UPDATE roles_permissions rp
         JOIN roles r ON r.uuid = rp.role_uuid
         JOIN permissions p ON p.uuid = rp.permission_uuid
          SET rp.status = 1
        WHERE r.slug = 'membre' AND p.slug IN (?)`,
      [this.ecrituresMembre],
    );

    for (const [, slugPaiement] of this.paiements) {
      await qr.query(
        `UPDATE roles_permissions rp
           JOIN roles r ON r.uuid = rp.role_uuid
           JOIN permissions p ON p.uuid = rp.permission_uuid
            SET rp.status = 0
          WHERE p.slug = ? AND r.slug <> 'administrateur'`,
        [slugPaiement],
      );
    }
  }
}
