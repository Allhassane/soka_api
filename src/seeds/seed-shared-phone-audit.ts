import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';

/**
 * AUDIT (lecture seule) - membres partageant un même numéro de téléphone.
 *
 * Le numéro **est** l'identifiant de connexion (`users.phone_number`), et il n'a **aucune
 * contrainte UNIQUE en base** - vérifié le 2026-07-30 : `users` ne porte que sa clé primaire et
 * un index non unique sur `member_uuid`. Un numéro partagé signifie donc qu'au plus une de ces
 * personnes pourra se connecter, et que l'unicité ne tient que par le code applicatif.
 *
 * Le classeur groupe les membres par numéro : une ligne par membre, les groupes séparés par une
 * couleur alternée pour qu'on lise d'un coup d'œil qui partage avec qui. La colonne « Compte »
 * dit lequel du groupe détient le compte - c'est elle qui indique qui peut se connecter.
 *
 * Exécution (depuis api/) :
 *   npm run seed:shared-phone-audit
 */

const COLONNES: Array<{ champ: string; entete: string; largeur: number }> = [
  { champ: 'phone', entete: 'Téléphone partagé', largeur: 18 },
  { champ: 'nb_membres', entete: 'Membres sur ce n°', largeur: 16 },
  { champ: 'matricule', entete: 'Matricule', largeur: 14 },
  { champ: 'lastname', entete: 'Nom', largeur: 22 },
  { champ: 'firstname', entete: 'Prénom', largeur: 24 },
  { champ: 'gender', entete: 'Genre', largeur: 10 },
  { champ: 'compte', entete: 'Compte', largeur: 14 },
  { champ: 'structure_name', entete: 'Structure', largeur: 26 },
  { champ: 'structure_level', entete: 'Palier', largeur: 16 },
  { champ: 'nb_responsabilites', entete: 'Nb resp.', largeur: 10 },
  { champ: 'responsabilites', entete: 'Responsabilité(s)', largeur: 34 },
  { champ: 'uuid', entete: 'UUID', largeur: 38 },
  { champ: 'created_at', entete: 'Créé le', largeur: 20 },
];

function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function run(): Promise<void> {
  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[audit] Base cible : ${ds.options.database as string}`);

  try {
    const lignes: any[] = await ds.query(
      `SELECT m.uuid, m.matricule, m.firstname, m.lastname, m.gender, m.phone, m.created_at,
              s.name AS structure_name, l.name AS structure_level,
              CASE WHEN EXISTS (SELECT 1 FROM users u WHERE u.member_uuid = m.uuid)
                   THEN 'oui' ELSE 'NON' END AS compte,
              COALESCE(GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ' + '), '') AS responsabilites,
              COUNT(DISTINCT mr.uuid) AS nb_responsabilites,
              g.nb AS nb_membres
         FROM members m
         JOIN (SELECT phone, COUNT(*) AS nb
                 FROM members
                WHERE TRIM(COALESCE(phone, '')) <> ''
                GROUP BY phone
               HAVING COUNT(*) > 1) g ON g.phone = m.phone
         LEFT JOIN structures s ON s.uuid = m.structure_uuid
         LEFT JOIN levels l ON l.uuid = s.level_uuid
         LEFT JOIN member_responsibilities mr ON mr.member_uuid = m.uuid AND mr.deleted_at IS NULL
         LEFT JOIN responsibilities r ON r.uuid = mr.responsibility_uuid
        GROUP BY m.uuid, m.matricule, m.firstname, m.lastname, m.gender, m.phone, m.created_at,
                 s.name, l.name, g.nb
        ORDER BY g.nb DESC, m.phone, m.lastname, m.firstname`,
    );

    const numeros = new Set(lignes.map((l) => l.phone));
    const sansCompte = lignes.filter((l) => l.compte === 'NON').length;
    const avecResp = lignes.filter((l) => Number(l.nb_responsabilites) > 0).length;

    console.log(`[audit] Numéros partagés : ${numeros.size}`);
    console.log(`[audit] Membres concernés : ${lignes.length}`);
    console.log(`[audit]   sans compte            : ${sansCompte}`);
    console.log(`[audit]   avec une responsabilité : ${avecResp}`);

    const classeur = new ExcelJS.Workbook();
    classeur.creator = 'SOKA - seed shared-phone-audit';
    classeur.created = new Date();
    const feuille = classeur.addWorksheet('Numéros partagés');
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

    // Bandes alternées PAR NUMÉRO (et non une ligne sur deux) : c'est le groupe qui compte ici.
    let numeroPrecedent: string | null = null;
    let bande = false;
    for (const ligne of lignes) {
      if (ligne.phone !== numeroPrecedent) {
        bande = !bande;
        numeroPrecedent = ligne.phone;
      }
      const cellule: Record<string, unknown> = {};
      for (const { champ } of COLONNES) {
        const v = ligne[champ];
        cellule[champ] = v instanceof Date ? v.toISOString() : v;
      }
      const row = feuille.addRow(cellule);
      if (bande) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF2F6FC' },
        };
      }
    }

    const fichier = path.resolve(
      __dirname,
      '..',
      '..',
      `membres-numero-partage-${horodatage()}.xlsx`,
    );
    fs.mkdirSync(path.dirname(fichier), { recursive: true });
    await classeur.xlsx.writeFile(fichier);
    console.log(`[audit] Export Excel -> ${fichier}`);
    console.log('[audit] (lecture seule - aucune écriture en base)');
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[audit] Échec :', err);
  process.exit(1);
});
