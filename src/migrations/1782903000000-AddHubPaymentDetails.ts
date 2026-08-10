import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Détail du guichet sur `payments` : opérateur, motif d'échec, horodatage d'encaissement.
 *
 * **Pourquoi.** Le guichet renvoie déjà `provider`, `failureCode`, `failureMessage` et `paidAt`
 * à chaque vérification (`HubService.checkPaymentStatus`), et l'API les jetait. Conséquence :
 * aucune statistique « par opérateur » ni « par motif d'échec » n'était calculable côté
 * application - alors que 45 % des tentatives échouent et que personne ne peut dire pourquoi.
 *
 * **Ce que ça ne change pas.** Aucune colonne existante n'est touchée, aucune donnée réécrite,
 * aucun comportement de paiement modifié. Les quatre colonnes sont **nullables** et le restent :
 * un paiement jamais engagé au guichet n'a ni opérateur ni motif.
 *
 * ⚠️ Les lignes antérieures restent à NULL : elles sont rattrapées par
 * `npm run seed:backfill-hub-details`, qui interroge le guichet en lecture seule.
 * (Le NOM DU SCRIPT npm est plus court que le nom du fichier `seed-backfill-hub-payment-details.ts` :
 * c'est celui-ci qu'il faut taper, l'autre sort en « Missing script ».)
 *
 * ⚠️ Pas de charset explicite sur les colonnes texte : elles héritent du défaut de la table
 * (`payments` est en latin1), ce qui évite d'introduire une collation étrangère dans une table
 * qui n'en a qu'une.
 *
 * ADDITIVE, IDEMPOTENTE, réversible.
 */
export class AddHubPaymentDetails1782903000000 implements MigrationInterface {
  name = 'AddHubPaymentDetails1782903000000';

  private readonly colonnes: Array<{ nom: string; definition: string }> = [
    { nom: 'provider', definition: 'VARCHAR(32) NULL' },
    { nom: 'failure_code', definition: 'VARCHAR(64) NULL' },
    { nom: 'failure_message', definition: 'TEXT NULL' },
    { nom: 'paid_at', definition: 'DATETIME NULL' },
  ];

  // `provider` et `failure_code` sont les deux axes de regroupement des statistiques :
  // sans index, chaque tableau de bord balaie les 1 800+ lignes de `payments`.
  private readonly index: Array<{ nom: string; colonne: string }> = [
    { nom: 'IDX_payments_provider', colonne: 'provider' },
    { nom: 'IDX_payments_failure_code', colonne: 'failure_code' },
  ];

  private async colonneExiste(qr: QueryRunner, nom: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.COLUMNS
        WHERE table_schema = DATABASE() AND table_name = 'payments' AND column_name = ? LIMIT 1`,
      [nom],
    );
    return r.length > 0;
  }

  private async indexExiste(qr: QueryRunner, nom: string): Promise<boolean> {
    const r = await qr.query(
      `SELECT 1 FROM information_schema.STATISTICS
        WHERE table_schema = DATABASE() AND table_name = 'payments' AND index_name = ? LIMIT 1`,
      [nom],
    );
    return r.length > 0;
  }

  public async up(qr: QueryRunner): Promise<void> {
    for (const { nom, definition } of this.colonnes) {
      if (await this.colonneExiste(qr, nom)) continue;
      await qr.query(`ALTER TABLE \`payments\` ADD COLUMN \`${nom}\` ${definition}`);
    }

    for (const { nom, colonne } of this.index) {
      if (await this.indexExiste(qr, nom)) continue;
      await qr.query(`CREATE INDEX \`${nom}\` ON \`payments\` (\`${colonne}\`)`);
    }
  }

  public async down(qr: QueryRunner): Promise<void> {
    for (const { nom } of [...this.index].reverse()) {
      if (!(await this.indexExiste(qr, nom))) continue;
      await qr.query(`DROP INDEX \`${nom}\` ON \`payments\``);
    }

    for (const { nom } of [...this.colonnes].reverse()) {
      if (!(await this.colonneExiste(qr, nom))) continue;
      await qr.query(`ALTER TABLE \`payments\` DROP COLUMN \`${nom}\``);
    }
  }
}
