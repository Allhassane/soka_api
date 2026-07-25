import 'reflect-metadata';
import AppDataSource from '../data-source';

/**
 * CORRECTIF - Numéros de téléphone saisis avec la LETTRE « O » au lieu du CHIFFRE « 0 ».
 *
 * Contexte : le front impose désormais 10 chiffres sur les champs téléphone (connexion et
 * « mot de passe oublié »). Les comptes dont le numéro contient un « O » sont donc devenus
 * impossibles à saisir - en pratique ils ne pouvaient déjà pas se connecter, puisque le login
 * se fait sur `users.phone_number`.
 *
 * Corrige deux colonnes, pour ne pas laisser diverger l'identifiant de connexion et la fiche
 * membre :
 *   - `users.phone_number`  (identifiant de login)
 *   - `members.phone`       (téléphone principal de la fiche membre)
 *
 * ⚠️ Volontairement HORS PÉRIMÈTRE : `members.phone_whatsapp`. Cette colonne contient toute
 * sorte de saisies libres (« NEANT », « V », un nom de famille, des espaces, un point en
 * préfixe…) ; un remplacement automatique n'y aurait aucun sens. À traiter à part, si besoin.
 *
 * ── Garde-fous ──────────────────────────────────────────────────────────────────────────
 * 1. Ne touche QUE les valeurs de la forme `^[0-9Oo]{10}$` - exactement 10 caractères composés
 *    de chiffres et de la lettre O. Le résultat est donc forcément un numéro à 10 chiffres.
 *    Toute autre saisie douteuse est signalée mais laissée telle quelle.
 * 2. Ignore les lignes soft-deleted (`deleted_at IS NOT NULL`).
 * 3. Refuse une correction qui entrerait en COLLISION avec un numéro déjà utilisé par une
 *    autre ligne de la même table.
 * 4. **Dry-run par défaut** : sans `--apply`, rien n'est écrit, on affiche seulement le plan.
 * 5. Écritures dans une transaction, en SQL paramétré direct - pas via le repository, pour
 *    éviter le hook `@BeforeUpdate` de `UserEntity` (re-hash du mot de passe) et n'écrire
 *    strictement que la colonne visée.
 *
 * Idempotent : une fois corrigé, un second passage ne trouve plus rien.
 *
 * ── Exécution (depuis soka_api) ─────────────────────────────────────────────────────────
 *   npm run seed:fix-phone-letter-o             # simulation, n'écrit rien
 *   npm run seed:fix-phone-letter-o -- --apply  # applique réellement
 */

const APPLY = process.argv.includes('--apply');

/** Exactement 10 caractères, chiffres et lettre O uniquement. */
const FIXABLE = /^[0-9Oo]{10}$/;

const fix = (value: string) => value.replace(/[Oo]/g, '0');

type Target = {
  /** Nom lisible, pour les logs. */
  label: string;
  table: 'users' | 'members';
  column: 'phone_number' | 'phone';
  /** Colonnes affichées pour identifier la ligne. */
  identity: string;
};

const TARGETS: Target[] = [
  {
    label: 'users.phone_number (login)',
    table: 'users',
    column: 'phone_number',
    identity: "CONCAT(COALESCE(firstname,''), ' ', COALESCE(lastname,''))",
  },
  {
    label: 'members.phone (fiche membre)',
    table: 'members',
    column: 'phone',
    identity: "CONCAT(COALESCE(firstname,''), ' ', COALESCE(lastname,''))",
  },
];

type Row = { id: number; uuid: string; who: string; value: string };

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[fix-phone] Base cible : ${ds.options.database as string}`);
  console.log(
    APPLY
      ? '[fix-phone] Mode : APPLICATION (les données seront modifiées)'
      : '[fix-phone] Mode : SIMULATION (aucune écriture - relancer avec --apply pour appliquer)',
  );

  let totalFixable = 0;
  let totalApplied = 0;
  let totalSkipped = 0;

  try {
    for (const target of TARGETS) {
      const { label, table, column, identity } = target;

      // On remonte tout ce qui n'est pas purement numérique, pour distinguer ce qu'on sait
      // corriger de ce qui demande un arbitrage humain.
      const rows: Row[] = await ds.query(
        `SELECT id, uuid, ${identity} AS who, ${column} AS value
           FROM ${table}
          WHERE ${column} IS NOT NULL
            AND ${column} <> ''
            AND ${column} REGEXP '[^0-9]'
            AND deleted_at IS NULL`,
      );

      console.log(`\n── ${label} - ${rows.length} valeur(s) non numérique(s)`);

      for (const row of rows) {
        const current = row.value;

        if (!FIXABLE.test(current)) {
          totalSkipped += 1;
          console.log(
            `   ⏭  [${row.id}] ${row.who.trim()} : « ${current} » - non corrigeable automatiquement, laissé tel quel`,
          );
          continue;
        }

        const corrected = fix(current);

        // Garde-fou anti-collision : un autre enregistrement porte-t-il déjà ce numéro ?
        const clash: { n: number }[] = await ds.query(
          `SELECT COUNT(*) AS n FROM ${table}
            WHERE ${column} = ? AND id <> ? AND deleted_at IS NULL`,
          [corrected, row.id],
        );
        if (Number(clash[0]?.n ?? 0) > 0) {
          totalSkipped += 1;
          console.log(
            `   ⚠️  [${row.id}] ${row.who.trim()} : « ${current} » → « ${corrected} » IGNORÉ - ce numéro est déjà utilisé`,
          );
          continue;
        }

        totalFixable += 1;
        console.log(
          `   ✅ [${row.id}] ${row.who.trim()} : « ${current} » → « ${corrected} »`,
        );

        if (APPLY) {
          await ds.transaction(async (manager) => {
            await manager.query(
              `UPDATE ${table} SET ${column} = ? WHERE id = ?`,
              [corrected, row.id],
            );
          });
          totalApplied += 1;
        }
      }
    }

    console.log('\n──────────────────────────────────────────────');
    console.log(`Corrigeables : ${totalFixable}`);
    console.log(`Ignorés (saisie libre ou collision) : ${totalSkipped}`);
    console.log(
      APPLY
        ? `Appliqués : ${totalApplied}`
        : 'Appliqués : 0 (simulation) - relancer avec « -- --apply »',
    );
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[fix-phone] Échec :', err);
  process.exit(1);
});
