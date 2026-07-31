import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource, EntityManager } from 'typeorm';
import AppDataSource from '../data-source';

/**
 * SEED - SUPPRESSION DÉFINITIVE des membres sans nom **ni** prénom.
 *
 * Cible : les lignes de `members` dont `firstname` ET `lastname` sont vides ou `NULL`
 * (`TRIM()` appliqué : un espace seul compte comme vide). Relevé au 2026-07-30 sur `soka_db` :
 * **102 lignes sur 8 151**, toutes créées entre le 13 et le 29 mai 2025, sans téléphone ni
 * e-mail mais avec un matricule et une structure - signature d'un lot d'import inachevé.
 *
 * ⚠️ **Suppression DURE, pas un `deleted_at`.** C'est ce qui a été demandé (« supprimer
 * totalement »). Rien dans l'application ne les remontera plus, et aucun `restore()` n'est
 * possible : le seul retour arrière est la sauvegarde JSON écrite juste avant la purge.
 *
 * ── Pourquoi le contrôle de références est la partie sérieuse ────────────────────────────
 * `members` ne porte **aucune contrainte de clé étrangère** (vérifié sur `soka_db`, comme le
 * reste du schéma) : MySQL ne s'opposera donc à rien. Supprimer un membre encore référencé
 * laisserait des lignes pointant dans le vide - un paiement sans bénéficiaire, un comité avec
 * un responsable fantôme, un compte utilisateur rattaché à personne. Le seed relit donc les
 * **20 colonnes** qui portent un uuid de membre et **refuse de supprimer** si l'une d'elles
 * touche une cible. Au 2026-07-30 les 102 sont totalement orphelines (0 référence partout).
 *
 * Exécution (depuis api/) :
 *   npm run seed:purge-nameless-members -- --dry-run   # inventaire + Excel, AUCUNE écriture
 *   npm run seed:purge-nameless-members -- --export-only
 *   npm run seed:purge-nameless-members -- --confirm   # supprime réellement
 *
 * Sans `--confirm`, le seed s'arrête après l'inventaire : une purge définitive ne doit pas
 * pouvoir partir d'une commande tapée de travers.
 */

/** Colonnes de la base qui référencent un membre par son uuid. */
const REFERENCES: Array<{ table: string; column: string }> = [
  { table: 'users', column: 'member_uuid' },
  { table: 'member_responsibilities', column: 'member_uuid' },
  { table: 'member_accessories', column: 'member_uuid' },
  { table: 'member_travels', column: 'member_uuid' },
  { table: 'member_transfer_items', column: 'member_uuid' },
  { table: 'committee_members', column: 'member_uuid' },
  { table: 'committees', column: 'responsible_member_uuid' },
  { table: 'activity_attendances', column: 'member_uuid' },
  { table: 'activity_participants', column: 'member_uuid' },
  { table: 'journal_member_receptions', column: 'member_uuid' },
  { table: 'journal_destinations', column: 'correspondent_member_uuid' },
  { table: 'journal_district_receptions', column: 'responsible_member_uuid' },
  { table: 'journal_zones', column: 'responsible_member_uuid' },
  { table: 'sokapay_transactions', column: 'member_uuid' },
  { table: 'payments', column: 'beneficiary_uuid' },
  { table: 'payments', column: 'actor_uuid' },
  { table: 'subscription_payments', column: 'beneficiary_uuid' },
  { table: 'subscription_payments', column: 'actor_uuid' },
  { table: 'donate_payments', column: 'beneficiary_uuid' },
  { table: 'donate_payments', column: 'actor_uuid' },
];

/**
 * Colonnes exportées dans le classeur, dans l'ordre d'affichage.
 * On garde tout ce qui permet de reconnaître la ligne et de comprendre d'où elle vient -
 * c'est la seule trace lisible qui restera après la purge.
 */
const COLONNES_EXPORT: Array<{ champ: string; entete: string; largeur: number }> = [
  { champ: 'id', entete: 'ID', largeur: 8 },
  { champ: 'uuid', entete: 'UUID', largeur: 38 },
  { champ: 'matricule', entete: 'Matricule', largeur: 14 },
  { champ: 'firstname', entete: 'Prénom', largeur: 14 },
  { champ: 'lastname', entete: 'Nom', largeur: 14 },
  { champ: 'gender', entete: 'Genre', largeur: 10 },
  { champ: 'birth_date', entete: 'Naissance', largeur: 14 },
  { champ: 'phone', entete: 'Téléphone', largeur: 14 },
  { champ: 'phone_whatsapp', entete: 'WhatsApp', largeur: 14 },
  { champ: 'email', entete: 'E-mail', largeur: 26 },
  { champ: 'structure_uuid', entete: 'Structure (uuid)', largeur: 38 },
  { champ: 'structure_name', entete: 'Structure', largeur: 26 },
  { champ: 'structure_level', entete: 'Palier', largeur: 16 },
  { champ: 'department_uuid', entete: 'Département (uuid)', largeur: 38 },
  { champ: 'division_uuid', entete: 'Division (uuid)', largeur: 38 },
  { champ: 'membership_date', entete: 'Date d’adhésion', largeur: 16 },
  { champ: 'status', entete: 'Statut', largeur: 12 },
  { champ: 'created_at', entete: 'Créé le', largeur: 20 },
  { champ: 'updated_at', entete: 'Modifié le', largeur: 20 },
  { champ: 'deleted_at', entete: 'Supprimé le', largeur: 20 },
  { champ: 'admin_uuid', entete: 'Auteur (uuid)', largeur: 38 },
];

/**
 * Critère unique, réutilisé par toutes les requêtes du seed : le libellé du membre est vide
 * des DEUX côtés. `TRIM(COALESCE(...))` couvre `NULL`, chaîne vide et espaces.
 *
 * ⚠️ On ne filtre PAS sur `deleted_at` : une purge doit aussi emporter les lignes déjà
 * supprimées logiquement. (Au 2026-07-30, `members` n'en contient aucune.)
 */
const CRITERE = `TRIM(COALESCE(m.firstname, '')) = '' AND TRIM(COALESCE(m.lastname, '')) = ''`;

export interface PurgeOptions {
  /** Écrire la sauvegarde JSON avant de supprimer (défaut : true). */
  backup?: boolean;
  /** Dossier de sauvegarde (défaut : `<api>/backups`). */
  backupDir?: string;
}

export interface PurgeReport {
  cibles: number;
  referencesBloquantes: Array<{ table: string; column: string; lignes: number }>;
  supprimes: number;
  backupFile: string | null;
  excelFile: string | null;
}

/** Horodatage `2026-07-30T22-05-33` pour nommer les fichiers produits. */
function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/** Lignes visées, enrichies du nom de leur structure pour que l'export soit lisible. */
export async function lireCibles(manager: EntityManager): Promise<any[]> {
  return manager.query(
    `SELECT m.*, s.name AS structure_name, l.name AS structure_level
       FROM members m
       LEFT JOIN structures s ON s.uuid = m.structure_uuid
       LEFT JOIN levels l ON l.uuid = s.level_uuid
      WHERE ${CRITERE}
      ORDER BY m.created_at, m.id`,
  );
}

/**
 * Compte, table par table, les lignes qui pointent encore vers une cible.
 *
 * Une table absente de l'environnement est **ignorée** plutôt que fatale : le schéma local et
 * celui de production ne sont pas alignés sur tous les modules (cas connu du module Activités).
 * Un `SELECT` sur une table inexistante ferait échouer la purge entière pour rien.
 */
export async function compterReferences(
  manager: EntityManager,
  uuids: string[],
): Promise<Array<{ table: string; column: string; lignes: number }>> {
  if (uuids.length === 0) return [];

  const resultats: Array<{ table: string; column: string; lignes: number }> = [];

  for (const { table, column } of REFERENCES) {
    const existe = await manager.query(
      `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column],
    );
    if (Number(existe?.[0]?.n ?? 0) === 0) {
      console.log(`[purge] ${table}.${column} : colonne absente de ce schéma, ignorée.`);
      continue;
    }

    const rows = await manager.query(
      `SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${column}\` IN (?)`,
      [uuids],
    );
    const lignes = Number(rows?.[0]?.n ?? 0);
    if (lignes > 0) resultats.push({ table, column, lignes });
  }

  return resultats;
}

/** Classeur Excel des lignes visées. Écrit même en `--dry-run` : c'est le livrable demandé. */
export async function exporterExcel(lignes: any[], fichier: string): Promise<string> {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'SOKA - seed purge-nameless-members';
  classeur.created = new Date();

  const feuille = classeur.addWorksheet('Membres sans nom ni prénom');
  feuille.columns = COLONNES_EXPORT.map((c) => ({
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
    to: { row: 1, column: COLONNES_EXPORT.length },
  };

  for (const ligne of lignes) {
    const cellule: Record<string, unknown> = {};
    for (const { champ } of COLONNES_EXPORT) {
      const valeur = ligne[champ];
      // Les dates MySQL arrivent en objets Date ; le reste est écrit tel quel, `null` inclus,
      // pour que le classeur reflète exactement la base (une cellule vide = une valeur vide).
      cellule[champ] = valeur instanceof Date ? valeur.toISOString() : valeur;
    }
    feuille.addRow(cellule);
  }

  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  await classeur.xlsx.writeFile(fichier);
  return fichier;
}

/**
 * Purge proprement dite. À appeler DANS une transaction pour que sauvegarde et suppression
 * forment un tout. Refuse de supprimer si une référence subsiste.
 */
export async function purgerMembresSansNom(
  manager: EntityManager,
  options: PurgeOptions = {},
): Promise<PurgeReport> {
  const {
    backup = true,
    backupDir = path.resolve(__dirname, '..', '..', 'backups'),
  } = options;

  const lignes = await lireCibles(manager);
  const uuids: string[] = lignes.map((l) => l.uuid);

  const referencesBloquantes = await compterReferences(manager, uuids);
  if (referencesBloquantes.length > 0) {
    return {
      cibles: lignes.length,
      referencesBloquantes,
      supprimes: 0,
      backupFile: null,
      excelFile: null,
    };
  }

  let backupFile: string | null = null;
  if (backup && lignes.length > 0) {
    fs.mkdirSync(backupDir, { recursive: true });
    backupFile = path.join(backupDir, `membres-sans-nom-${horodatage()}.json`);
    fs.writeFileSync(backupFile, JSON.stringify({ members: lignes }, null, 1), 'utf8');
  }

  let supprimes = 0;
  if (uuids.length > 0) {
    // Par paquets : une liste de plusieurs milliers d'uuid dans un `IN` finit par dépasser
    // `max_allowed_packet`. 500 est confortable pour 36 caractères par valeur.
    for (let i = 0; i < uuids.length; i += 500) {
      const lot = uuids.slice(i, i + 500);
      const res = await manager.query(
        `DELETE FROM \`members\` WHERE \`uuid\` IN (?)`,
        [lot],
      );
      supprimes += Number(res?.affectedRows ?? 0);
    }
  }

  return {
    cibles: lignes.length,
    referencesBloquantes: [],
    supprimes,
    backupFile,
    excelFile: null,
  };
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const exportOnly = process.argv.includes('--export-only');
  const confirme = process.argv.includes('--confirm');
  const backup = !process.argv.includes('--no-backup');

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[purge] Base cible : ${ds.options.database as string}`);

  const runner = ds.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    const lignes = await lireCibles(runner.manager);
    const uuids: string[] = lignes.map((l) => l.uuid);

    const total = await runner.manager.query(
      'SELECT COUNT(*) AS n FROM members m',
    );
    console.log(
      `[purge] Membres sans nom ni prénom : ${lignes.length} / ${Number(total?.[0]?.n ?? 0)} lignes de la table.`,
    );

    // Excel systématiquement produit : c'est la trace demandée, et elle doit exister
    // AVANT toute suppression.
    const excelFile = path.resolve(
      __dirname,
      '..',
      '..',
      `membres-sans-nom-${horodatage()}.xlsx`,
    );
    await exporterExcel(lignes, excelFile);
    console.log(`[purge] Export Excel -> ${excelFile}`);

    const references = await compterReferences(runner.manager, uuids);
    if (references.length > 0) {
      console.log('[purge] ⛔ Références encore présentes, suppression refusée :');
      for (const r of references) {
        console.log(`[purge]    ${r.table}.${r.column} : ${r.lignes} ligne(s)`);
      }
      await runner.rollbackTransaction();
      console.log(
        '[purge] Traiter ces lignes d’abord (ou retirer le membre de la cible) : ' +
          'supprimer maintenant laisserait des références vers le vide.',
      );
      return;
    }
    console.log(
      `[purge] Aucune référence vers ces membres (${REFERENCES.length} colonnes contrôlées).`,
    );

    if (exportOnly) {
      await runner.rollbackTransaction();
      console.log('[purge] --export-only : aucune suppression.');
      return;
    }

    if (!confirme || dryRun) {
      await runner.rollbackTransaction();
      console.log(
        `[purge] ${dryRun ? '--dry-run' : 'Confirmation absente'} : aucune suppression. ` +
          'Relancer avec --confirm pour supprimer définitivement les ' +
          `${lignes.length} ligne(s).`,
      );
      return;
    }

    const rapport = await purgerMembresSansNom(runner.manager, { backup });
    if (rapport.referencesBloquantes.length > 0) {
      await runner.rollbackTransaction();
      console.log('[purge] ⛔ Références apparues entre-temps, transaction annulée.');
      return;
    }

    await runner.commitTransaction();
    console.log(`[purge] ${rapport.supprimes} membre(s) supprimé(s) définitivement.`);
    if (rapport.backupFile) {
      console.log(`[purge] Sauvegarde JSON (seul retour arrière) : ${rapport.backupFile}`);
    }
  } catch (err) {
    await runner.rollbackTransaction();
    throw err;
  } finally {
    await runner.release();
    await ds.destroy();
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[purge] Échec :', err);
    process.exit(1);
  });
}
