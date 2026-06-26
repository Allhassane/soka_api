import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * (Annulée) Lot 4 + Lot 5 retirés à la demande de l'utilisateur.
 * Migration neutralisée : aucune colonne ajoutée. Conservée vide pour ne pas
 * perturber l'historique des migrations (le fichier peut être supprimé
 * manuellement). Si une version antérieure a déjà créé les colonnes
 * cep_quantity / retardataires_quantity / order_quantity / received_quantity,
 * elles restent en base (inutilisées, sans impact) — supprimables à la main.
 */
export class AddEditionSpecialLinesAndReconciliation1781600000000
  implements MigrationInterface
{
  name = 'AddEditionSpecialLinesAndReconciliation1781600000000';

  public async up(_qr: QueryRunner): Promise<void> {
    // no-op
  }

  public async down(_qr: QueryRunner): Promise<void> {
    // no-op
  }
}
