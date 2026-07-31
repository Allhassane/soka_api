import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';

/**
 * SEED - ALIGNE `members.phone` sur `users.phone_number` du compte rattaché.
 *
 * Le numéro du **compte** fait foi : c'est celui avec lequel la personne se connecte et reçoit
 * son mot de passe par SMS. Quand la fiche membre en porte un autre, c'est elle qui est périmée.
 *
 * ⚠️ **La règle a une exception, constatée en base : le numéro du compte n'est pas toujours
 * valide.** Sur les 29 écarts du 2026-07-30, deux comptes portent un numéro **cassé** alors que
 * la fiche porte le même numéro correctement écrit :
 *   - `O708090074` (lettre O au lieu du zéro) contre `0708090074` en fiche - c'est le défaut que
 *     traite `seed:fix-phone-letter-o` ;
 *   - `+2250101220127` (format international) contre `0101220127` en fiche.
 * Les recopier détruirait deux fiches saines pour propager une erreur de saisie. Le seed **écarte
 * donc tout numéro de compte qui n'est pas 10 chiffres** et le signale : c'est le compte qu'il
 * faut corriger, pas la fiche. (16 comptes sur 7 886 sont dans ce cas au total.)
 *
 * ⚠️ **Le nom ne suffit pas à dire s'il s'agit de la même personne.** Comparer les seuls
 * `lastname` donne 6 « noms différents », mais 4 sont la même personne avec nom et prénom
 * **inversés** entre la fiche et le compte (PAHA ELVIS BERENGER / ELVIS BERENGER PAHA) ou une
 * faute de frappe (TWE / TUWE). Le seed compare donc l'**ensemble des mots** du nom complet, et
 * ne marque « rattachement douteux » que ce qui ne se recoupe pas du tout. Ces lignes-là restent
 * à arbitrer à la main : après alignement, l'écart de téléphone ne les révélera plus.
 *
 * Vérifié avant écriture : aucun de ces numéros n'appartient déjà à un autre membre, l'alignement
 * ne crée donc pas de doublon côté `members`.
 *
 * Exécution (depuis api/) :
 *   npm run seed:align-member-phone -- --dry-run
 *   npm run seed:align-member-phone -- --confirm
 *   npm run seed:align-member-phone -- --confirm --meme-nom-seulement   # les 23 seulement
 */

const COLONNES: Array<{ champ: string; entete: string; largeur: number }> = [
  { champ: 'cas', entete: 'Cas', largeur: 34 },
  { champ: 'matricule', entete: 'Matricule', largeur: 14 },
  { champ: 'membre_nom', entete: 'Membre - nom', largeur: 22 },
  { champ: 'membre_prenom', entete: 'Membre - prénom', largeur: 24 },
  { champ: 'ancien_tel', entete: 'Ancien n° (fiche)', largeur: 18 },
  { champ: 'nouveau_tel', entete: 'Nouveau n° (compte)', largeur: 20 },
  { champ: 'compte_nom', entete: 'Compte - nom', largeur: 22 },
  { champ: 'compte_prenom', entete: 'Compte - prénom', largeur: 24 },
  { champ: 'structure_name', entete: 'Structure', largeur: 26 },
  { champ: 'member_uuid', entete: 'Membre (uuid)', largeur: 38 },
  { champ: 'user_uuid', entete: 'Compte (uuid)', largeur: 38 },
];

function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** Format de connexion attendu : 10 chiffres, sans indicatif ni séparateur. */
const FORMAT_TELEPHONE = /^[0-9]{10}$/;

/**
 * Même personne ? On compare l'**ensemble des mots** de `nom + prénom` des deux côtés, et non
 * les seuls `lastname` : dans cette base, la même personne apparaît régulièrement avec nom et
 * prénom inversés entre sa fiche et son compte. Un seul mot commun de 3 lettres ou plus suffit -
 * l'objectif est de repérer les rattachements **franchement** douteux, pas d'arbitrer les
 * homonymes.
 */
function memePersonne(a: string, b: string): boolean {
  const mots = (s: string) =>
    new Set(
      s
        .toUpperCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .split(/[^A-Z0-9]+/)
        .filter((mot) => mot.length >= 3),
    );
  const motsA = mots(a);
  for (const mot of mots(b)) if (motsA.has(mot)) return true;
  return false;
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const confirme = process.argv.includes('--confirm');
  const memeNomSeulement = process.argv.includes('--meme-nom-seulement');
  const backup = !process.argv.includes('--no-backup');

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[phone] Base cible : ${ds.options.database as string}`);

  try {
    const lignes: any[] = await ds.query(
      `SELECT m.uuid AS member_uuid, u.uuid AS user_uuid, m.matricule,
              m.lastname AS membre_nom, m.firstname AS membre_prenom,
              u.lastname AS compte_nom, u.firstname AS compte_prenom,
              m.phone AS ancien_tel, u.phone_number AS nouveau_tel,
              s.name AS structure_name,
              (UPPER(TRIM(COALESCE(u.lastname, ''))) = UPPER(TRIM(COALESCE(m.lastname, '')))) AS meme_nom
         FROM users u
         JOIN members m ON m.uuid = u.member_uuid
         LEFT JOIN structures s ON s.uuid = m.structure_uuid
        WHERE TRIM(COALESCE(u.phone_number, '')) <> TRIM(COALESCE(m.phone, ''))
        ORDER BY meme_nom DESC, m.lastname`,
    );

    for (const l of lignes) {
      const numeroValide = FORMAT_TELEPHONE.test(String(l.nouveau_tel ?? '').trim());
      const meme = memePersonne(
        `${l.membre_nom ?? ''} ${l.membre_prenom ?? ''}`,
        `${l.compte_nom ?? ''} ${l.compte_prenom ?? ''}`,
      );
      l.meme_personne = meme;
      l.numero_valide = numeroValide;
      l.cas = !numeroValide
        ? '⛔ n° du compte invalide - fiche NON modifiée'
        : meme
          ? 'même personne - n° de fiche périmé'
          : '⚠️ rattachement douteux - aligné quand même';
    }

    const invalides = lignes.filter((l) => !l.numero_valide);
    const douteux = lignes.filter((l) => l.numero_valide && !l.meme_personne);
    const cibles = lignes.filter(
      (l) => l.numero_valide && (!memeNomSeulement || l.meme_personne),
    );

    console.log(`[phone] Écarts fiche / compte : ${lignes.length}`);
    console.log(`[phone]   même personne          : ${lignes.filter((l) => l.meme_personne).length}`);
    console.log(`[phone]   rattachement douteux   : ${douteux.length}`);
    console.log(`[phone]   n° de compte invalide  : ${invalides.length} (écartés)`);
    console.log(`[phone] À aligner : ${cibles.length}`);

    if (invalides.length > 0) {
      console.log(
        '[phone] ⛔ Écartés : le compte porte un numéro hors format (10 chiffres attendus) ' +
          'alors que la fiche est correcte. C’est le COMPTE qu’il faut corriger.',
      );
      for (const l of invalides) {
        console.log(
          `[phone]    ${l.compte_nom} ${l.compte_prenom ?? ''} : compte « ${l.nouveau_tel} » ` +
            `vs fiche « ${l.ancien_tel} »`,
        );
      }
    }

    if (douteux.length > 0 && !memeNomSeulement) {
      console.log(
        '[phone] ⚠️ Rattachements douteux alignés quand même : le lien restera faux mais ne ' +
          'sera plus repérable par l’écart de téléphone. Détail dans le classeur (lignes rouges).',
      );
      for (const l of douteux) {
        console.log(
          `[phone]    ${l.membre_nom} ${l.membre_prenom ?? ''} (fiche ${l.ancien_tel}) ` +
            `← compte de ${l.compte_nom} ${l.compte_prenom ?? ''} (${l.nouveau_tel})`,
        );
      }
    }

    if (lignes.length === 0) {
      console.log('[phone] Aucun écart : rien à faire.');
      return;
    }

    const fichier = path.resolve(
      __dirname,
      '..',
      '..',
      `telephones-alignes-${horodatage()}.xlsx`,
    );
    const classeur = new ExcelJS.Workbook();
    classeur.creator = 'SOKA - seed align-member-phone';
    classeur.created = new Date();
    const feuille = classeur.addWorksheet('Ecarts fiche-compte');
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
    for (const l of lignes) {
      const row = feuille.addRow(l);
      // Rouge pour les rattachements douteux : ce sont les seules lignes qui resteront à
      // traiter après ce seed, et elles deviendront invisibles au contrôle automatique.
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: {
          argb: !l.numero_valide
            ? 'FFE0E0E0'
            : l.meme_personne
              ? 'FFE8F5E9'
              : 'FFFFD9D9',
        },
      };
    }
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    await classeur.xlsx.writeFile(fichier);
    console.log(`[phone] Export Excel -> ${fichier}`);

    if (!confirme || dryRun) {
      console.log(
        `[phone] ${dryRun ? '--dry-run' : 'Confirmation absente'} : aucune écriture. ` +
          'Relancer avec --confirm.',
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
        const backupFile = path.join(
          backupDir,
          `telephones-membres-${horodatage()}.json`,
        );
        // On sauvegarde l'ancien numéro : c'est la seule information détruite par ce seed.
        fs.writeFileSync(
          backupFile,
          JSON.stringify(
            {
              alignements: cibles.map((l) => ({
                member_uuid: l.member_uuid,
                ancien_tel: l.ancien_tel,
                nouveau_tel: l.nouveau_tel,
                meme_personne: Boolean(l.meme_personne),
              })),
            },
            null,
            1,
          ),
          'utf8',
        );
        console.log(`[phone] Sauvegarde des anciens numéros : ${backupFile}`);
      }

      let modifies = 0;
      for (const l of cibles) {
        const res = await runner.manager.query(
          `UPDATE members SET phone = ? WHERE uuid = ?`,
          [String(l.nouveau_tel).trim(), l.member_uuid],
        );
        modifies += Number(res?.affectedRows ?? 0);
      }

      await runner.commitTransaction();
      console.log(`[phone] ${modifies} fiche(s) membre alignée(s) sur le numéro du compte.`);
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

run().catch((err) => {
  console.error('[phone] Échec :', err);
  process.exit(1);
});
