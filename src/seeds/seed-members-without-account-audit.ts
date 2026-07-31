import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';

/**
 * AUDIT (lecture seule) - membres sans aucune ligne dans `users`.
 *
 * ⚠️ **Ne rien supprimer sur ce seul critère.** Ne pas avoir de compte n'est pas un défaut de
 * données : créer un membre ne crée pas de compte de connexion. Relevé au 2026-07-30 sur
 * `soka_db` : **360 membres sur 8 049**, tous avec un nom, 240 avec un téléphone, **62 portant
 * une responsabilité**, et certains créés **le jour même**. Contrairement au lot de 102 lignes
 * sans nom ni prénom (`seed:purge-nameless-members`), il s'agit ici de membres réels.
 *
 * Ce seed produit l'inventaire et le classeur ; la décision de purge, si elle a lieu, doit
 * porter sur un critère plus fin (par exemple : sans compte ET sans responsabilité ET sans
 * téléphone ET créé avant telle date).
 *
 * Exécution (depuis api/) :
 *   npm run seed:members-without-account-audit
 */

const COLONNES: Array<{ champ: string; entete: string; largeur: number }> = [
  { champ: 'id', entete: 'ID', largeur: 8 },
  { champ: 'uuid', entete: 'UUID', largeur: 38 },
  { champ: 'matricule', entete: 'Matricule', largeur: 14 },
  { champ: 'lastname', entete: 'Nom', largeur: 22 },
  { champ: 'firstname', entete: 'Prénom', largeur: 24 },
  { champ: 'gender', entete: 'Genre', largeur: 10 },
  { champ: 'phone', entete: 'Téléphone', largeur: 14 },
  { champ: 'phone_whatsapp', entete: 'WhatsApp', largeur: 14 },
  { champ: 'email', entete: 'E-mail', largeur: 26 },
  { champ: 'structure_name', entete: 'Structure', largeur: 26 },
  { champ: 'structure_level', entete: 'Palier', largeur: 16 },
  { champ: 'department_name', entete: 'Département', largeur: 16 },
  // Colonne décisive : c'est elle qui distingue un membre inactif d'un responsable en exercice.
  { champ: 'responsabilites', entete: 'Responsabilité(s)', largeur: 34 },
  { champ: 'nb_responsabilites', entete: 'Nb resp.', largeur: 10 },
  { champ: 'membership_date', entete: 'Date d’adhésion', largeur: 16 },
  { champ: 'created_at', entete: 'Créé le', largeur: 20 },
  { champ: 'status', entete: 'Statut', largeur: 12 },
];

function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function run(): Promise<void> {
  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[audit] Base cible : ${ds.options.database as string}`);

  try {
    /**
     * `NOT EXISTS` plutôt qu'un `LEFT JOIN ... IS NULL` : un membre qui porterait plusieurs
     * comptes dupliquerait la ligne dans la jointure et fausserait le compte.
     * Les responsabilités sont agrégées en une chaîne pour tenir sur une seule ligne d'export.
     */
    const lignes: any[] = await ds.query(
      `SELECT m.id, m.uuid, m.matricule, m.firstname, m.lastname, m.gender,
              m.phone, m.phone_whatsapp, m.email, m.membership_date, m.created_at, m.status,
              s.name AS structure_name, l.name AS structure_level, d.name AS department_name,
              COALESCE(GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ' + '), '') AS responsabilites,
              COUNT(DISTINCT mr.uuid) AS nb_responsabilites
         FROM members m
         LEFT JOIN structures s ON s.uuid = m.structure_uuid
         LEFT JOIN levels l ON l.uuid = s.level_uuid
         LEFT JOIN departments d ON d.uuid = m.department_uuid
         LEFT JOIN member_responsibilities mr ON mr.member_uuid = m.uuid AND mr.deleted_at IS NULL
         LEFT JOIN responsibilities r ON r.uuid = mr.responsibility_uuid
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.member_uuid = m.uuid)
        GROUP BY m.id, m.uuid, m.matricule, m.firstname, m.lastname, m.gender,
                 m.phone, m.phone_whatsapp, m.email, m.membership_date, m.created_at, m.status,
                 s.name, l.name, d.name
        ORDER BY (COUNT(DISTINCT mr.uuid) > 0) DESC, m.lastname, m.firstname`,
    );

    const total = Number(
      (await ds.query('SELECT COUNT(*) AS n FROM members'))?.[0]?.n ?? 0,
    );
    const avecResp = lignes.filter((l) => Number(l.nb_responsabilites) > 0).length;
    const avecTel = lignes.filter((l) => (l.phone ?? '').trim() !== '').length;
    const sansRien = lignes.filter(
      (l) =>
        Number(l.nb_responsabilites) === 0 &&
        (l.phone ?? '').trim() === '' &&
        (l.email ?? '').trim() === '',
    ).length;

    console.log(`[audit] Membres sans compte : ${lignes.length} / ${total}`);
    console.log(`[audit]   dont porteurs d'une responsabilité : ${avecResp}`);
    console.log(`[audit]   dont avec un téléphone             : ${avecTel}`);
    console.log(`[audit]   sans responsabilité, tel ni e-mail : ${sansRien}`);

    const classeur = new ExcelJS.Workbook();
    classeur.creator = 'SOKA - seed members-without-account-audit';
    classeur.created = new Date();
    const feuille = classeur.addWorksheet('Membres sans compte');
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
      // Les porteurs de responsabilité sont surlignés : ce sont eux qu'une purge ne doit
      // surtout pas emporter sans arbitrage.
      if (Number(ligne.nb_responsabilites) > 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFF3CD' },
        };
      }
    }

    const fichier = path.resolve(
      __dirname,
      '..',
      '..',
      `membres-sans-compte-${horodatage()}.xlsx`,
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
