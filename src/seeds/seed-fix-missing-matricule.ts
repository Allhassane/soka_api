import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';
import { MatriculeService } from '../members/matricule.service';

/**
 * SEED - RATTRAPAGE des membres sans matricule.
 *
 * ── Pourquoi ces fiches existent ────────────────────────────────────────────────────────────
 * `ImportService.buildPayload()` recopiait la cellule Excel « Matricule » verbatim et ignorait
 * les cellules vides ; le chemin `create` de l'import n'appelant pas `MemberService.store()`,
 * **aucun matricule n'était généré**. Sur les 271 membres créés par l'import entre le 2026-07-27
 * et le 2026-08-04 : 235 sans matricule. La cause est corrigée dans le code (`MatriculeService`,
 * partagé par `store()` et l'import) - ce seed ne referme que l'écart déjà en base.
 *
 * ── Ce qui est attribué ─────────────────────────────────────────────────────────────────────
 * `AA-NNNN` où `AA` est l'année de **création de la fiche** et `NNNN` son `id`. Ce n'est pas un
 * choix arbitraire : c'est la sémantique même du générateur (`MAX(id) + 1`, soit l'`id` que la
 * ligne va recevoir). L'`id` d'une fiche existante étant déjà consommé, le générateur - qui part
 * de `MAX(id) + 1` - ne le réémettra jamais. Vérifié au 2026-09-08 : **0 collision** avec
 * l'existant, **0 doublon** interne au lot.
 *
 * ── Ce à quoi ce seed ne touche PAS ─────────────────────────────────────────────────────────
 * Les matricules **présents mais hors format** : 24 fiches en numérotation héritée
 * (`0007269`…, de vrais identifiants de l'ancien système), 18 portant un numéro de ligne de
 * tableur (`1`..`18`) et 3 valeurs de texte libre uniques (`sss`, `XXXXX`, `22:335-0218`).
 * Les écraser détruirait de l'information dans le premier cas et relève d'un arbitrage métier
 * dans les autres. Ils sont **listés dans le rapport**, jamais modifiés.
 *
 * ── `--liberer-doublons` : le strict nécessaire pour poser UQ_members_matricule ─────────────
 * Une valeur non plausible **portée par plusieurs fiches** est le seul cas qui empêche la
 * contrainte d'unicité d'exister. Au 2026-09-08 : 10 fiches (ids 7987-7996, même import) sur
 * 2 phrases - « Nouveau membre ou non digitalisé » ×8, « Ancien membre venu d'autre centre » ×2.
 * Ce sont des **notes de saisie mises à la place du matricule**, pas des identifiants : ces
 * membres sont exactement le cas traité par ce seed, avec une phrase au lieu du vide.
 *
 * ⚠️ Le drapeau ne vise QUE les valeurs non plausibles **en doublon**. Une valeur non plausible
 * unique (`sss`) ne bloque aucune contrainte : elle reste intacte, son sort est un arbitrage
 * métier. L'ancienne valeur est conservée dans la colonne « Matricule avant » du rapport.
 *
 * Exécution (depuis api/) :
 *   npm run seed:fix-missing-matricule -- --dry-run
 *   npm run seed:fix-missing-matricule -- --confirm
 *   npm run seed:fix-missing-matricule -- --liberer-doublons --confirm
 */

const COLONNES: Array<{ champ: string; entete: string; largeur: number }> = [
  { champ: 'decision', entete: 'Décision', largeur: 26 },
  { champ: 'motif', entete: 'Motif', largeur: 46 },
  { champ: 'id', entete: 'id', largeur: 8 },
  { champ: 'matricule_avant', entete: 'Matricule avant', largeur: 32 },
  { champ: 'matricule_apres', entete: 'Matricule après', largeur: 16 },
  { champ: 'lastname', entete: 'Nom', largeur: 22 },
  { champ: 'firstname', entete: 'Prénom', largeur: 24 },
  { champ: 'structure_name', entete: 'Structure', largeur: 26 },
  { champ: 'created_at', entete: 'Créé le', largeur: 22 },
  { champ: 'uuid', entete: 'Membre (uuid)', largeur: 38 },
];

function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function exporterExcel(lignes: any[], fichier: string): Promise<void> {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'SOKA - seed fix-missing-matricule';
  classeur.created = new Date();
  const feuille = classeur.addWorksheet('Matricules');
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

  for (const ligne of lignes) {
    const cellule: Record<string, unknown> = {};
    for (const { champ } of COLONNES) {
      const v = ligne[champ];
      cellule[champ] = v instanceof Date ? v.toISOString() : v;
    }
    const row = feuille.addRow(cellule);
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: {
        argb: ligne.decision === 'matricule attribué' ? 'FFE8F5E9' : 'FFFFE9C8',
      },
    };
  }

  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  await classeur.xlsx.writeFile(fichier);
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const confirme = process.argv.includes('--confirm');
  const libererDoublons = process.argv.includes('--liberer-doublons');

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[matricule] Base cible : ${ds.options.database as string}`);

  try {
    // Tous les matricules déjà pris, soft-deletés compris : une ligne supprimée occupe toujours
    // son numéro, et le réattribuer créerait un doublon invisible.
    const pris = new Set<string>(
      (
        await ds.query(
          "SELECT matricule FROM members WHERE TRIM(COALESCE(matricule,'')) <> ''",
        )
      ).map((r: any) => String(r.matricule).trim()),
    );

    const sansMatricule: any[] = await ds.query(
      `SELECT m.id, m.uuid, m.firstname, m.lastname, m.created_at,
              s.name AS structure_name
         FROM members m
         LEFT JOIN structures s ON s.uuid = m.structure_uuid
        WHERE TRIM(COALESCE(m.matricule,'')) = ''
        ORDER BY m.id`,
    );

    // Présents mais hors format : reportés pour information, jamais modifiés.
    const horsFormat: any[] = await ds.query(
      `SELECT m.id, m.uuid, m.matricule, m.firstname, m.lastname, m.created_at,
              s.name AS structure_name
         FROM members m
         LEFT JOIN structures s ON s.uuid = m.structure_uuid
        WHERE TRIM(COALESCE(m.matricule,'')) <> ''
          AND m.matricule NOT REGEXP '^[0-9]{2}-[0-9]{4,}$'
        ORDER BY m.id`,
    );

    const rapport: any[] = [];
    const aEcrire: Array<{ uuid: string; matricule: string }> = [];

    for (const m of sansMatricule) {
      const annee = new Date(m.created_at).getFullYear();
      let rang = Number(m.id);
      let candidat = MatriculeService.format(annee, rang);

      // Garde-fou : les matricules hérités ne suivent pas les `id` (la numérotation historique
      // monte à 8604 pour un MAX(id) de 8270). Un `id` peut donc, en théorie, viser un numéro
      // déjà pris sur la même année. Constaté nul au 2026-09-08, conservé par prudence.
      let decale = false;
      while (pris.has(candidat)) {
        rang++;
        candidat = MatriculeService.format(annee, rang);
        decale = true;
      }

      pris.add(candidat);
      aEcrire.push({ uuid: m.uuid, matricule: candidat });
      rapport.push({
        ...m,
        matricule_avant: '(vide)',
        matricule_apres: candidat,
        decision: 'matricule attribué',
        motif: decale
          ? `numéro de l'id déjà pris → décalé à ${rang}`
          : 'année de création + id de la fiche',
      });
    }

    // Combien de fiches portent chaque valeur hors format : c'est le seul critère qui distingue
    // ce qui bloque `UQ_members_matricule` de ce qui ne fait que déplaire.
    const occurrences = new Map<string, number>();
    for (const m of horsFormat) {
      const v = String(m.matricule).trim();
      occurrences.set(v, (occurrences.get(v) ?? 0) + 1);
    }

    let liberees = 0;
    for (const m of horsFormat) {
      const valeur = String(m.matricule).trim();
      const plausible = MatriculeService.isPlausible(valeur);
      const bloqueUnicite = !plausible && (occurrences.get(valeur) ?? 0) > 1;

      if (bloqueUnicite && libererDoublons) {
        const annee = new Date(m.created_at).getFullYear();
        let rang = Number(m.id);
        let candidat = MatriculeService.format(annee, rang);
        while (pris.has(candidat)) {
          rang++;
          candidat = MatriculeService.format(annee, rang);
        }
        pris.add(candidat);
        aEcrire.push({ uuid: m.uuid, matricule: candidat });
        liberees++;
        rapport.push({
          ...m,
          matricule_avant: valeur,
          matricule_apres: candidat,
          decision: 'matricule attribué',
          motif: `note de saisie portée par ${occurrences.get(valeur)} fiches - bloquait UQ_members_matricule`,
        });
        continue;
      }

      rapport.push({
        ...m,
        matricule_avant: valeur,
        matricule_apres: '',
        decision: 'laissé tel quel',
        motif: plausible
          ? 'numérotation héritée - identifiant réel, à conserver'
          : bloqueUnicite
            ? `valeur en doublon (${occurrences.get(valeur)} fiches) - bloque UQ_members_matricule, relancer avec --liberer-doublons`
            : 'valeur non conforme mais unique - arbitrage métier, hors périmètre de ce seed',
      });
    }

    console.log(`[matricule] Sans matricule        : ${sansMatricule.length}`);
    console.log(`[matricule]   à attribuer         : ${aEcrire.length - liberees}`);
    console.log(`[matricule] Hors format           : ${horsFormat.length}`);
    console.log(
      `[matricule]   doublons libérés    : ${liberees}` +
        (libererDoublons ? '' : ' (--liberer-doublons absent)'),
    );

    if (!confirme || dryRun) {
      const fichier = path.resolve(
        __dirname,
        '..',
        '..',
        `matricules-a-attribuer-${horodatage()}.xlsx`,
      );
      await exporterExcel(rapport, fichier);
      console.log(`[matricule] Export Excel -> ${fichier}`);
      console.log(
        `[matricule] ${dryRun ? '--dry-run' : 'Confirmation absente'} : aucune écriture. ` +
          'Relancer avec --confirm.',
      );
      return;
    }

    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      for (const ligne of aEcrire) {
        await runner.manager.query('UPDATE members SET matricule = ? WHERE uuid = ?', [
          ligne.matricule,
          ligne.uuid,
        ]);
      }
      await runner.commitTransaction();
      console.log(`[matricule] ${aEcrire.length} matricules écrits.`);
    } catch (e) {
      await runner.rollbackTransaction();
      throw e;
    } finally {
      await runner.release();
    }

    // Revérification post-écriture : c'est elle qui prouve le résultat, pas le compteur ci-dessus.
    const [restant] = await ds.query(
      "SELECT COUNT(*) AS n FROM members WHERE TRIM(COALESCE(matricule,'')) = ''",
    );
    const [doublons] = await ds.query(
      `SELECT COUNT(*) AS n FROM (
         SELECT matricule FROM members
          WHERE TRIM(COALESCE(matricule,'')) <> ''
          GROUP BY matricule HAVING COUNT(*) > 1) d`,
    );
    console.log(`[matricule] Reste sans matricule  : ${restant.n}`);
    console.log(`[matricule] Valeurs en doublon    : ${doublons.n}`);

    const fichier = path.resolve(
      __dirname,
      '..',
      '..',
      `matricules-attribues-${horodatage()}.xlsx`,
    );
    await exporterExcel(rapport, fichier);
    console.log(`[matricule] Export Excel -> ${fichier}`);
  } finally {
    await ds.destroy();
  }
}

run().catch((e) => {
  console.error('[matricule] ÉCHEC :', e);
  process.exit(1);
});
