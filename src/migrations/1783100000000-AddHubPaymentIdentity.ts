import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Identité HUB2 sur `payments` : `hub_payment_id` (`pay_…`) et `hub_created_at`.
 *
 * **Pourquoi.** `hub_payment_id` est la seule clé fiable de rapprochement entre l'application et
 * l'export HUB2 (colonne `paymentId`), donc la condition de la concordance « Solde HUB2 = Solde
 * App ». Sans elle, le rapprochement retombe sur des heuristiques montant + date et laisse des
 * écarts inexplicables. `hub_created_at` est le départ réel de la tentative : `created_at` date
 * la création du **lien**, si bien qu'un lien reçu à 9 h, ouvert à 12 h et payé en 40 s ferait
 * annoncer 3 h de délai de confirmation au lieu de 40 secondes.
 *
 * Le guichet renvoie **déjà** les deux champs (`soka-pay/api/src/server/paymentLinks.ts`,
 * `id` et `createdAt`) : l'API les jetait à la désérialisation.
 *
 * 🚨 **À jouer AVANT le premier `seed:backfill-hub-details -- --apply` en production.** Le filtre
 * de reprise du rattrapage devient `provider IS NULL OR hub_payment_id IS NULL` ; sans ces
 * colonnes, un `--apply` renseignerait `provider` partout et il faudrait ensuite **un second
 * balayage complet du guichet de production** pour obtenir l'identité HUB2.
 *
 * ⚠️ **`IDX_payments_hub_payment_id` n'est PAS unique, et ne doit jamais le devenir.** Une ligne
 * `payments` est un LIEN, pas une transaction : le guichet ne rend qu'une tentative par lien (il
 * privilégie la réussie, sinon la dernière), et sur un lien jamais abouti cette tentative peut
 * changer d'un appel à l'autre. Un index unique ferait échouer la synchronisation sur un cas
 * parfaitement normal.
 *
 * ⚠️ Pas de charset explicite : les colonnes héritent du défaut de la table (`payments` est en
 * latin1), ce qui évite d'y introduire une collation étrangère.
 *
 * ADDITIVE, IDEMPOTENTE, réversible.
 */
export class AddHubPaymentIdentity1783100000000 implements MigrationInterface {
  name = 'AddHubPaymentIdentity1783100000000';

  private readonly colonnes: Array<{ nom: string; definition: string }> = [
    { nom: 'hub_payment_id', definition: 'VARCHAR(40) NULL' },
    { nom: 'hub_created_at', definition: 'DATETIME NULL' },
  ];

  // Index simple (NON unique - cf. en-tête) : c'est la clé de jointure avec l'export HUB2,
  // parcourue pour chaque ligne importée.
  private readonly index: Array<{ nom: string; colonne: string }> = [
    { nom: 'IDX_payments_hub_payment_id', colonne: 'hub_payment_id' },
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
