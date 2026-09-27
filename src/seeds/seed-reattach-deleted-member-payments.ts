import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { DataSource, DataSourceOptions } from 'typeorm';
import AppDataSource from '../data-source';
import { FicheMembre, ficheActiveJumelle, telephoneNormalise } from './reattach-deleted-member-payments.lib';

/**
 * **Rattache les paiements RÉUSSIS portés par une fiche membre SUPPRIMÉE à la fiche ACTIVE de la
 * même personne** - RESPO-COMPTA-REGUL, 2026-09-27.
 *
 * Constaté le 27/09 : trois doublons supprimés APRÈS avoir payé (15 000 F chacun). Les paiements
 * restaient accrochés à la fiche supprimée : lignes anonymes dans l'export comptable, et, sur la
 * fiche conservée, un membre qui paraissait n'avoir jamais payé - donc libre de payer deux fois.
 * `MemberService.delete()` refuse désormais ce cas ; ce seed répare les fiches déjà supprimées.
 *
 * Règles :
 * 1. **SIMULATION par défaut** : sans `--apply`, rien n'est écrit, tout est listé.
 * 2. Même personne = même téléphone ET même nom, une seule candidate
 *    (`reattach-deleted-member-payments.lib.ts`) ; sinon le paiement est laissé et signalé.
 * 3. Un paiement n'est rattaché que si TOUS ses rôles supprimés (payeur, bénéficiaire) ont une
 *    fiche jumelle : jamais de rattachement à moitié.
 * 4. Trois tables dans UNE transaction : `payments` et la ligne métier liée
 *    (`subscription_payments` ou `donate_payments`), payeur et bénéficiaire. `updated_at` est
 *    préservé (le cron s'en sert pour ses fenêtres de revérification).
 * 5. **Fichier de retour arrière** écrit AVANT toute écriture (`backups/`).
 * 6. Idempotent : un second passage ne trouve plus rien.
 *
 * Exécution (depuis api/) :
 *   npm run seed:reattach-deleted-member-payments              # simulation
 *   npm run seed:reattach-deleted-member-payments -- --apply   # applique
 * 🪤 Le double tiret est obligatoire : sans lui, npm consomme `--apply` et rien n'est appliqué.
 */
const APPLY = process.argv.includes('--apply');

interface PaiementSurFicheSupprimee {
  uuid: string;
  transaction_id: string;
  source: string;
  source_uuid: string;
  total_amount: string;
  actor_uuid: string;
  beneficiary_uuid: string;
}

interface Rattachement {
  paiement: PaiementSurFicheSupprimee;
  /** rôle → [fiche supprimée, fiche active] */
  roles: Array<{ colonne: 'actor_uuid' | 'beneficiary_uuid'; de: string; vers: string }>;
}

const TABLES_LIEES = ['subscription_payments', 'donate_payments'] as const;

async function run() {
  // Mêmes réglages que `AppDataSource`, SANS migrations : son motif `src/migrations/*.ts` ramasse
  // un fichier de test (`add-members-matricule-unique-index.spec.ts`) et l'initialisation plante
  // sur `describe is not defined` (constaté le 2026-09-27). Ce seed n'en a pas besoin.
  const ds = await new DataSource({
    ...AppDataSource.options,
    migrations: [],
  } as DataSourceOptions).initialize();
  try {
    console.log(
      APPLY
        ? '[rattachement fiches] Mode : APPLICATION'
        : '[rattachement fiches] Mode : SIMULATION (aucune écriture - relancer avec « -- --apply »)',
    );

    const paiements: PaiementSurFicheSupprimee[] = await ds.query(
      `SELECT p.uuid, p.transaction_id, p.source, p.source_uuid, p.total_amount, p.actor_uuid, p.beneficiary_uuid
         FROM payments p
        WHERE p.deleted_at IS NULL AND p.payment_status = 'paid'
          AND (p.actor_uuid IN (SELECT m.uuid FROM members m WHERE m.deleted_at IS NOT NULL)
            OR p.beneficiary_uuid IN (SELECT m.uuid FROM members m WHERE m.deleted_at IS NOT NULL))
        ORDER BY p.created_at`,
    );
    if (paiements.length === 0) {
      console.log('Aucun paiement réussi porté par une fiche supprimée : rien à faire.');
      return;
    }

    const uuids = [...new Set(paiements.flatMap((p) => [p.actor_uuid, p.beneficiary_uuid]))];
    const fiches: Array<FicheMembre & { matricule: string | null; deleted_at: Date | null }> =
      await ds.query(
        'SELECT uuid, firstname, lastname, phone, matricule, deleted_at FROM members WHERE uuid IN (?)',
        [uuids],
      );
    const ficheParUuid = new Map(fiches.map((f) => [f.uuid, f]));

    // La fiche jumelle de chaque fiche supprimée (calculée une fois).
    const jumelles = new Map<string, { fiche: any; motif: string | null }>();
    for (const f of fiches.filter((x) => x.deleted_at)) {
      const telephone = telephoneNormalise(f.phone);
      const candidates = telephone
        ? await ds.query(
          `SELECT uuid, firstname, lastname, phone, matricule FROM members
            WHERE deleted_at IS NULL AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', ''), 10) = ?`,
          [telephone],
        )
        : [];
      jumelles.set(f.uuid, ficheActiveJumelle(f, candidates));
    }

    const aFaire: Rattachement[] = [];
    const f = (n: unknown) => new Intl.NumberFormat('fr-FR').format(Number(n));
    for (const p of paiements) {
      const roles: Rattachement['roles'] = [];
      const refus: string[] = [];
      for (const colonne of ['actor_uuid', 'beneficiary_uuid'] as const) {
        const fiche = ficheParUuid.get(p[colonne]);
        if (!fiche?.deleted_at) continue;
        const j = jumelles.get(fiche.uuid);
        if (j?.fiche) roles.push({ colonne, de: fiche.uuid, vers: j.fiche.uuid });
        else refus.push(`${colonne} : ${j?.motif ?? 'fiche introuvable'}`);
      }
      const libelle = `${p.transaction_id} (${f(p.total_amount)} F)`;
      if (refus.length > 0) {
        console.log(`  ✗ LAISSÉ  ${libelle} - ${refus.join(' ; ')}`);
        continue;
      }
      const desc = roles
        .map((r) => {
          const de = ficheParUuid.get(r.de);
          const vers = jumelles.get(r.de)?.fiche;
          return `${r.colonne === 'actor_uuid' ? 'payeur' : 'bénéficiaire'} ${de?.matricule ?? r.de} → ${vers?.matricule ?? r.vers} (${vers?.firstname} ${vers?.lastname})`;
        })
        .join(' ; ');
      console.log(`  ✓ RATTACHÉ ${libelle} - ${desc}`);
      aFaire.push({ paiement: p, roles });
    }

    console.log(`\n${aFaire.length} paiement(s) à rattacher sur ${paiements.length} trouvé(s).`);
    if (!APPLY || aFaire.length === 0) {
      if (!APPLY) console.log('Pour appliquer : npm run seed:reattach-deleted-member-payments -- --apply');
      return;
    }

    // Retour arrière, AVANT toute écriture.
    const dossier = join(process.cwd(), 'backups');
    mkdirSync(dossier, { recursive: true });
    const fichier = join(dossier, `rollback-rattachement-fiches-${new Date().toISOString().replace(/[:.]/g, '-')}.sql`);
    const lignesRetour: string[] = [
      '-- Retour arrière de seed:reattach-deleted-member-payments (RESPO-COMPTA-REGUL)',
    ];
    for (const { paiement, roles } of aFaire) {
      for (const r of roles) {
        lignesRetour.push(
          `UPDATE payments SET ${r.colonne} = '${r.de}', updated_at = updated_at WHERE uuid = '${paiement.uuid}' AND ${r.colonne} = '${r.vers}';`,
        );
        for (const table of TABLES_LIEES) {
          lignesRetour.push(
            `UPDATE ${table} SET ${r.colonne} = '${r.de}', updated_at = updated_at WHERE payment_uuid = '${paiement.uuid}' AND ${r.colonne} = '${r.vers}';`,
          );
        }
      }
    }
    writeFileSync(fichier, `${lignesRetour.join('\n')}\n`, 'utf8');
    console.log(`Retour arrière écrit : ${fichier}`);

    await ds.transaction(async (m) => {
      for (const { paiement, roles } of aFaire) {
        for (const r of roles) {
          const res = await m.query(
            `UPDATE payments SET ${r.colonne} = ?, updated_at = updated_at WHERE uuid = ? AND ${r.colonne} = ?`,
            [r.vers, paiement.uuid, r.de],
          );
          if (res.affectedRows !== 1) {
            throw new Error(`${paiement.transaction_id} : paiement non modifié (${res.affectedRows}) - transaction annulée.`);
          }
          for (const table of TABLES_LIEES) {
            await m.query(
              `UPDATE ${table} SET ${r.colonne} = ?, updated_at = updated_at WHERE payment_uuid = ? AND ${r.colonne} = ?`,
              [r.vers, paiement.uuid, r.de],
            );
          }
        }
      }
    });

    const [restants] = await ds.query(
      `SELECT COUNT(*) AS n FROM payments p
        WHERE p.uuid IN (?) AND (p.actor_uuid IN (SELECT m.uuid FROM members m WHERE m.deleted_at IS NOT NULL)
          OR p.beneficiary_uuid IN (SELECT m.uuid FROM members m WHERE m.deleted_at IS NOT NULL))`,
      [aFaire.map((a) => a.paiement.uuid)],
    );
    console.log(`Appliqué. Contrôle : ${Number(restants.n)} paiement(s) traité(s) encore sur une fiche supprimée (attendu 0).`);
    if (Number(restants.n) !== 0) process.exitCode = 1;
  } finally {
    await ds.destroy();
  }
}

run().catch((e) => {
  console.error('[rattachement fiches] ÉCHEC :', e?.message ?? e);
  process.exit(1);
});
