import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';

/**
 * SEED - MISE AU FORMAT des numéros de téléphone.
 *
 * Règle métier (Côte d'Ivoire) : **10 chiffres commençant par 01, 05 ou 07**. Aucun indicatif
 * n'est accepté - `+225` / `00225` sont retirés, pas conservés.
 *
 * Colonnes traitées : `users.phone_number` (l'identifiant de connexion), `members.phone`,
 * `members.phone_whatsapp`, `members.tutor_phone`.
 *
 * ── Ce que le seed corrige ───────────────────────────────────────────────────────────────
 *  - lettre **O** saisie à la place du zéro (`O708090074`, `07O8980578`) - même défaut que
 *    `seed:fix-phone-letter-o`, traité ici de façon uniforme sur les quatre colonnes ;
 *  - séparateurs et espaces (`07 08 09 00 74`, `07.08.09.00.74`) ;
 *  - indicatif `+225`, `00225` ou `225` en tête.
 *
 * ── Ce qu'il NE corrige PAS, volontairement ──────────────────────────────────────────────
 *  - **numéro trop court ou vide de sens** (`+225933862` → 6 chiffres, `00000000`) : le rendre
 *    conforme demanderait d'inventer des chiffres. Laissé tel quel, signalé.
 *  - **10 chiffres mais préfixe interdit** (`08…`, `27…`, `77…`, `43…`) : ce sont probablement
 *    d'anciens numéros à 8 chiffres mal repris lors du passage à 10 chiffres. Il n'existe pas de
 *    règle de conversion sûre - deviner ici, c'est fabriquer un numéro qui appartient peut-être à
 *    quelqu'un d'autre. Laissé tel quel, listé dans le classeur pour reprise manuelle.
 *  - **une valeur qui entrerait en collision** avec un `users.phone_number` déjà pris : deux
 *    comptes sur le même identifiant rendraient la connexion ambiguë. Laissé tel quel, signalé.
 *
 * Une valeur vide reste vide : ce seed corrige des saisies, il n'en invente pas.
 *
 * Exécution (depuis api/) :
 *   npm run seed:normalize-phones -- --dry-run
 *   npm run seed:normalize-phones -- --confirm
 */

const CIBLES: Array<{ table: string; colonne: string; cle: string }> = [
  { table: 'users', colonne: 'phone_number', cle: 'uuid' },
  { table: 'members', colonne: 'phone', cle: 'uuid' },
  { table: 'members', colonne: 'phone_whatsapp', cle: 'uuid' },
  { table: 'members', colonne: 'tutor_phone', cle: 'uuid' },
];

/** 10 chiffres, préfixe mobile ivoirien. */
const CONFORME = /^(01|05|07)[0-9]{8}$/;

const COLONNES: Array<{ champ: string; entete: string; largeur: number }> = [
  { champ: 'verdict', entete: 'Verdict', largeur: 34 },
  { champ: 'table', entete: 'Table', largeur: 12 },
  { champ: 'colonne', entete: 'Colonne', largeur: 18 },
  { champ: 'avant', entete: 'Avant', largeur: 20 },
  { champ: 'apres', entete: 'Après', largeur: 20 },
  { champ: 'identite', entete: 'Personne', largeur: 34 },
  { champ: 'cle', entete: 'UUID', largeur: 38 },
];

function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Normalise une saisie vers le format attendu, ou renvoie `null` si le résultat n'est pas
 * conforme - auquel cas on ne touche à rien.
 *
 * L'ordre compte : `O` → `0` **avant** de retirer les non-chiffres, sinon `O708090074` perdrait
 * son premier caractère au lieu d'être corrigé.
 */
export function normaliserTelephone(valeur: string | null | undefined): string | null {
  if (valeur === null || valeur === undefined) return null;

  let v = String(valeur).trim();
  if (v === '') return null;

  v = v.replace(/[Oo]/g, '0').replace(/[^0-9]/g, '');

  // Indicatif ivoirien sous ses trois écritures. On ne retire `225` que s'il reste ensuite
  // de quoi former un numéro : un abonné dont le numéro commence réellement par 225 (préfixe
  // interdit de toute façon) ne doit pas être amputé silencieusement.
  for (const indicatif of ['00225', '225']) {
    if (v.startsWith(indicatif) && v.length > indicatif.length) {
      const reste = v.slice(indicatif.length);
      if (CONFORME.test(reste)) {
        v = reste;
        break;
      }
    }
  }

  return CONFORME.test(v) ? v : null;
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const confirme = process.argv.includes('--confirm');
  const backup = !process.argv.includes('--no-backup');

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[tel] Base cible : ${ds.options.database as string}`);

  try {
    // Identifiants déjà pris : une normalisation ne doit pas créer deux comptes sur le même
    // numéro de connexion. Tenu à jour au fil des corrections.
    const identifiantsPris = new Set<string>(
      (
        await ds.query(
          "SELECT phone_number FROM users WHERE TRIM(COALESCE(phone_number,'')) <> ''",
        )
      ).map((r: any) => String(r.phone_number).trim()),
    );

    const rapport: any[] = [];
    const corrections: Array<{
      table: string;
      colonne: string;
      cle: string;
      valeur: string;
      avant: string;
    }> = [];

    for (const { table, colonne, cle } of CIBLES) {
      const lignes: any[] = await ds.query(
        `SELECT ${cle} AS cle, ${colonne} AS valeur, lastname, firstname
           FROM ${table}
          WHERE TRIM(COALESCE(${colonne}, '')) <> ''
            AND NOT (${colonne} REGEXP '^(01|05|07)[0-9]{8}$')`,
      );

      for (const l of lignes) {
        const identite = `${l.lastname ?? ''} ${l.firstname ?? ''}`.trim();
        const apres = normaliserTelephone(l.valeur);
        const base = { table, colonne, cle: l.cle, avant: l.valeur, identite };

        if (apres === null) {
          const chiffres = String(l.valeur).replace(/[Oo]/g, '0').replace(/[^0-9]/g, '');
          rapport.push({
            ...base,
            apres: '',
            verdict:
              chiffres.length === 10
                ? '⚠️ 10 chiffres mais préfixe interdit - inchangé'
                : '⚠️ irrécupérable (trop court / sans valeur) - inchangé',
          });
          continue;
        }

        if (
          table === 'users' &&
          identifiantsPris.has(apres) &&
          String(l.valeur).trim() !== apres
        ) {
          rapport.push({
            ...base,
            apres,
            verdict: '⛔ collision avec un compte existant - inchangé',
          });
          continue;
        }

        if (table === 'users') {
          identifiantsPris.delete(String(l.valeur).trim());
          identifiantsPris.add(apres);
        }
        corrections.push({ table, colonne, cle: l.cle, valeur: apres, avant: l.valeur });
        rapport.push({ ...base, apres, verdict: 'corrigé' });
      }
    }

    const corriges = rapport.filter((r) => r.verdict === 'corrigé');
    console.log(`[tel] Valeurs hors format examinées : ${rapport.length}`);
    for (const { table, colonne } of CIBLES) {
      const t = rapport.filter((r) => r.table === table && r.colonne === colonne);
      if (t.length === 0) continue;
      console.log(
        `[tel]   ${table}.${colonne} : ${t.length} hors format, ` +
          `${t.filter((r) => r.verdict === 'corrigé').length} corrigeable(s)`,
      );
    }
    console.log(`[tel] À corriger : ${corriges.length}`);

    for (const r of rapport.filter((x) => x.verdict !== 'corrigé')) {
      console.log(`[tel]   ${r.verdict} : ${r.table}.${r.colonne} « ${r.avant} » (${r.identite})`);
    }

    if (rapport.length === 0) {
      console.log('[tel] Tous les numéros sont déjà au format : rien à faire.');
      return;
    }

    const fichier = path.resolve(
      __dirname,
      '..',
      '..',
      `telephones-normalises-${horodatage()}.xlsx`,
    );
    const classeur = new ExcelJS.Workbook();
    classeur.creator = 'SOKA - seed normalize-phone-numbers';
    classeur.created = new Date();
    const feuille = classeur.addWorksheet('Numeros hors format');
    feuille.columns = COLONNES.map((c) => ({
      header: c.entete,
      key: c.champ,
      width: c.largeur,
    }));
    feuille.getRow(1).font = { bold: true };
    feuille.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE9EDF5' },
    };
    feuille.views = [{ state: 'frozen', ySplit: 1 }];
    feuille.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: COLONNES.length },
    };
    for (const r of rapport) {
      const row = feuille.addRow(r);
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: r.verdict === 'corrigé' ? 'FFE8F5E9' : 'FFFFE9C8' },
      };
    }
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    await classeur.xlsx.writeFile(fichier);
    console.log(`[tel] Export Excel -> ${fichier}`);

    if (!confirme || dryRun || corriges.length === 0) {
      console.log(
        `[tel] ${dryRun || !confirme ? 'Aucune écriture' : 'Rien à écrire'} : ` +
          'relancer avec --confirm pour appliquer.',
      );
      return;
    }

    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      if (backup) {
        const backupDir = path.resolve(__dirname, '..', '..', 'backups');
        fs.mkdirSync(backupDir, { recursive: true });
        const backupFile = path.join(backupDir, `telephones-format-${horodatage()}.json`);
        fs.writeFileSync(
          backupFile,
          JSON.stringify({ corrections }, null, 1),
          'utf8',
        );
        console.log(`[tel] Sauvegarde des valeurs d'origine : ${backupFile}`);
      }

      let modifies = 0;
      for (const c of corrections) {
        const res = await runner.manager.query(
          `UPDATE ${c.table} SET ${c.colonne} = ? WHERE ${
            CIBLES.find((x) => x.table === c.table)!.cle
          } = ?`,
          [c.valeur, c.cle],
        );
        modifies += Number(res?.affectedRows ?? 0);
      }

      await runner.commitTransaction();
      console.log(`[tel] ${modifies} numéro(s) mis au format.`);
    } catch (err) {
      await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }
  } finally {
    await ds.destroy();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[tel] Échec :', err);
    process.exit(1);
  });
}
