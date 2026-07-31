import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';
import { compterReferences } from './seed-nameless-members-purge';

/**
 * SEED - SUPPRESSION DÉFINITIVE de membres **sans compte** répondant à des critères de tri.
 *
 * Population de départ : les membres qui n'ont **aucune ligne dans `users`** (360 au 2026-07-30,
 * cf. `seed:members-without-account-audit`). Critères, activables séparément :
 *
 *   --hors-sous-groupe    le membre n'est PAS rattaché à un SOUS_GROUPE (ou n'a pas de structure)
 *   --sans-telephone      le membre n'a pas de téléphone
 *   --doublon-telephone   son numéro est déjà porté par un AUTRE membre sans compte de la liste
 *                         (le plus ancien est conservé, les suivants sont visés)
 *
 * Par défaut les critères se **cumulent** (ET). `--ou` prend leur **union**.
 *
 * ── Deux constats de terrain, à connaître avant de lancer quoi que ce soit ───────────────
 *
 * ⚠️ **`--hors-sous-groupe` ET `--sans-telephone` ne désigne AUCUN membre** (relevé 2026-07-30,
 * vérifié aussi sur la table entière) : les 7 membres hors sous-groupe ont tous un téléphone,
 * les 120 sans téléphone sont tous sur un sous-groupe. Résultat correct, pas une panne.
 *
 * ⚠️ **`--doublon-telephone` ne vise PAS des doublons de fiche.** Les 6 groupes concernés sont
 * des **paires de personnes différentes** partageant un téléphone (TOUVOLY / TRAH BI,
 * YEO / SORO, SORO / TUO, SORO / SILUE, KASSUO / TOUSSEGOUE, KOUAI / KOUADIO) - un numéro de
 * famille, pas une saisie en double. Les supprimer efface 6 membres réels. Et ce n'est pas
 * nécessaire pour créer les comptes des autres : `seed:create-missing-user-accounts` saute
 * simplement le second d'un numéro déjà pris.
 *
 * ⚠️ **Suppression DURE.** Seul retour arrière : la sauvegarde JSON écrite avant la purge.
 * Les 20 colonnes qui portent un uuid de membre sont relues ; par défaut la purge est **refusée**
 * si l'une d'elles touche une cible. Deux façons de lever le blocage :
 *
 *   --exclure-references    les membres référencés sont **retirés de la cible**, les autres sont
 *                           supprimés (mode utile quand un lot mélange fiches vides et
 *                           responsables en exercice) ;
 *   --purger-references     les lignes qui rattachent la cible sont **supprimées avec elle**,
 *                           mais uniquement dans les tables de `TABLES_PURGEABLES` :
 *                           `member_responsibilities` et `member_accessories`. Tout le reste
 *                           (comptes, comités, paiements, journal, transferts) continue de
 *                           bloquer : ce sont des faits, pas des rattachements - un paiement
 *                           encaissé ou une décision de comité ne s'efface pas au passage d'une
 *                           purge de fiches.
 *
 * ⚠️ `--purger-references` **libère des postes** : chaque responsabilité supprimée laisse une
 * structure sans responsable, visible immédiatement dans l'application. Le nombre est affiché
 * avant confirmation, et le détail part dans la sauvegarde JSON.
 *
 * Exécution (depuis api/) :
 *   npm run seed:purge-members-without-account -- --sans-telephone --dry-run
 *   npm run seed:purge-members-without-account -- --sans-telephone --exclure-references --confirm
 *
 * Sans `--confirm`, rien n'est supprimé.
 */

const COLONNES: Array<{ champ: string; entete: string; largeur: number }> = [
  { champ: 'decision', entete: 'Décision', largeur: 24 },
  { champ: 'motif', entete: 'Motif de sélection', largeur: 26 },
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
  { champ: 'nb_responsabilites', entete: 'Nb resp.', largeur: 10 },
  { champ: 'responsabilites', entete: 'Responsabilité(s)', largeur: 34 },
  { champ: 'partage_avec', entete: 'Numéro partagé avec', largeur: 34 },
  { champ: 'membership_date', entete: 'Date d’adhésion', largeur: 16 },
  { champ: 'created_at', entete: 'Créé le', largeur: 20 },
];

/**
 * Tables dont les lignes sont de simples **rattachements** au membre : elles n'ont aucun sens
 * sans lui et peuvent partir avec, sous `--purger-references`. Toute autre table qui référence
 * la cible bloque la purge, même avec cette option.
 */
const TABLES_PURGEABLES: Array<{ table: string; column: string }> = [
  { table: 'member_responsibilities', column: 'member_uuid' },
  { table: 'member_accessories', column: 'member_uuid' },
];

function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Membres sans compte répondant aux critères.
 *
 * `partage_avec` nomme l'autre porteur du même numéro : sans lui, une ligne « doublon
 * téléphone » est illisible et on ne peut pas juger s'il s'agit d'une fiche en double ou de
 * deux personnes d'un même foyer.
 */
async function lireCibles(ds: DataSource, where: string): Promise<any[]> {
  return ds.query(
    `SELECT m.id, m.uuid, m.matricule, m.firstname, m.lastname, m.gender,
            m.phone, m.phone_whatsapp, m.email, m.membership_date, m.created_at,
            s.name AS structure_name, l.name AS structure_level,
            COALESCE(GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ' + '), '') AS responsabilites,
            COUNT(DISTINCT mr.uuid) AS nb_responsabilites,
            COALESCE((
              SELECT GROUP_CONCAT(CONCAT(a.lastname, ' ', a.firstname) SEPARATOR ' ; ')
                FROM members a
               WHERE a.phone = m.phone AND a.uuid <> m.uuid
                 AND TRIM(COALESCE(m.phone, '')) <> ''
            ), '') AS partage_avec
       FROM members m
       LEFT JOIN structures s ON s.uuid = m.structure_uuid
       LEFT JOIN levels l ON l.uuid = s.level_uuid
       LEFT JOIN member_responsibilities mr ON mr.member_uuid = m.uuid AND mr.deleted_at IS NULL
       LEFT JOIN responsibilities r ON r.uuid = mr.responsibility_uuid
      WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.member_uuid = m.uuid)
        AND (${where})
      GROUP BY m.id, m.uuid, m.matricule, m.firstname, m.lastname, m.gender,
               m.phone, m.phone_whatsapp, m.email, m.membership_date, m.created_at,
               s.name, l.name
      ORDER BY m.lastname, m.firstname`,
  );
}

async function exporterExcel(lignes: any[], fichier: string): Promise<void> {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'SOKA - seed purge-members-without-account';
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
    // Vert = supprimé, orange = conservé parce que référencé. La couleur doit se lire sans
    // relire la colonne « Décision » : c'est le premier coup d'œil sur un fichier de purge.
    const conserve = String(ligne.decision ?? '').startsWith('CONSERVÉ');
    row.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: conserve ? 'FFFFE9C8' : 'FFE8F5E9' },
    };
  }

  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  await classeur.xlsx.writeFile(fichier);
}

async function run(): Promise<void> {
  const args = process.argv;
  const horsSousGroupe = args.includes('--hors-sous-groupe');
  const sansTelephone = args.includes('--sans-telephone');
  const doublonTelephone = args.includes('--doublon-telephone');
  const union = args.includes('--ou');
  const exclureReferences = args.includes('--exclure-references');
  const purgerReferences = args.includes('--purger-references');
  const dryRun = args.includes('--dry-run');
  const confirme = args.includes('--confirm');
  const backup = !args.includes('--no-backup');

  if (!horsSousGroupe && !sansTelephone && !doublonTelephone) {
    console.error(
      '[purge] Aucun critère. Préciser --hors-sous-groupe, --sans-telephone et/ou --doublon-telephone.\n' +
        '        Sans critère, la cible serait « tous les membres sans compte » (360) : refusé.',
    );
    process.exit(1);
  }

  const conditions: string[] = [];
  // `l.name IS NULL` couvre le membre sans structure : il n'est pas sur un sous-groupe.
  if (horsSousGroupe) conditions.push(`(l.name <> 'SOUS_GROUPE' OR l.name IS NULL)`);
  if (sansTelephone) conditions.push(`TRIM(COALESCE(m.phone, '')) = ''`);
  if (doublonTelephone) {
    /**
     * Membre **sans compte** dont le numéro est déjà porté par un autre membre.
     *
     * ⚠️ Le critère ne regarde PAS si cet autre membre a lui-même un compte. La première
     * version le faisait, et elle est devenue fausse dès que `seed:create-missing-user-accounts`
     * a tourné : les premiers porteurs ayant reçu un compte, le critère ne désignait plus que
     * 3 personnes au lieu des 43 concernées. Un critère qui dépend de l'ordre d'exécution des
     * seeds ne veut rien dire.
     *
     * Le membre visé est de toute façon celui qui **ne peut pas se connecter** : son numéro,
     * seul identifiant possible, appartient déjà à quelqu'un d'autre.
     */
    conditions.push(
      `(TRIM(COALESCE(m.phone, '')) <> '' AND EXISTS (
          SELECT 1 FROM (SELECT phone, uuid FROM members) AS autre
           WHERE autre.phone = m.phone AND autre.uuid <> m.uuid
        ))`,
    );
  }
  const where = conditions.join(union ? ' OR ' : ' AND ');

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[purge] Base cible : ${ds.options.database as string}`);
  console.log(`[purge] Critère : membres SANS COMPTE et (${where})`);

  try {
    const lignes = await lireCibles(ds, where);
    const total = Number(
      (await ds.query('SELECT COUNT(*) AS n FROM members'))?.[0]?.n ?? 0,
    );
    console.log(`[purge] Sélection : ${lignes.length} / ${total} membres.`);

    if (lignes.length === 0) {
      console.log(
        '[purge] Aucun membre ne répond à ce critère : rien à supprimer, rien à exporter.',
      );
      return;
    }

    // ---- Qui est référencé ailleurs ? (par membre, pas seulement par table) ----
    const references = await compterReferences(
      ds.manager,
      lignes.map((l) => l.uuid),
    );
    const uuidsReferences = new Set<string>();

    // Sous `--purger-references`, les rattachements purgeables ne comptent plus comme des
    // références bloquantes : ils partiront avec le membre, dans la même transaction.
    const tablesBloquantes = [
      ...(purgerReferences ? [] : TABLES_PURGEABLES),
      { table: 'committee_members', column: 'member_uuid' },
      { table: 'member_travels', column: 'member_uuid' },
      { table: 'member_transfer_items', column: 'member_uuid' },
      { table: 'activity_attendances', column: 'member_uuid' },
      { table: 'journal_member_receptions', column: 'member_uuid' },
      { table: 'users', column: 'member_uuid' },
    ];

    for (const { table, column } of tablesBloquantes) {
      const rows = await ds.query(
        `SELECT DISTINCT \`${column}\` AS uuid FROM \`${table}\` WHERE \`${column}\` IN (?)`,
        [lignes.map((l) => l.uuid)],
      );
      for (const r of rows) if (r.uuid) uuidsReferences.add(r.uuid);
    }
    // Paiements : bénéficiaire ou acteur, sur les trois tables. Jamais purgeables.
    for (const table of ['payments', 'subscription_payments', 'donate_payments']) {
      const rows = await ds.query(
        `SELECT DISTINCT beneficiary_uuid AS uuid FROM \`${table}\` WHERE beneficiary_uuid IN (?)
         UNION SELECT DISTINCT actor_uuid FROM \`${table}\` WHERE actor_uuid IN (?)`,
        [lignes.map((l) => l.uuid), lignes.map((l) => l.uuid)],
      );
      for (const r of rows) if (r.uuid) uuidsReferences.add(r.uuid);
    }

    for (const ligne of lignes) {
      const estReference = uuidsReferences.has(ligne.uuid);
      ligne.decision = estReference
        ? exclureReferences
          ? 'CONSERVÉ (référencé)'
          : 'CONSERVÉ (purge refusée)'
        : 'supprimé';
      const motifs: string[] = [];
      if (sansTelephone && String(ligne.phone ?? '').trim() === '')
        motifs.push('sans téléphone');
      if (
        horsSousGroupe &&
        String(ligne.structure_level ?? '') !== 'SOUS_GROUPE'
      )
        motifs.push('hors sous-groupe');
      if (doublonTelephone && String(ligne.partage_avec ?? '') !== '')
        motifs.push('numéro partagé');
      ligne.motif = motifs.join(' + ');
    }

    const aSupprimer = lignes.filter((l) => l.decision === 'supprimé');
    console.log(
      `[purge]   référencés ailleurs : ${uuidsReferences.size} (dont ${
        lignes.filter((l) => Number(l.nb_responsabilites) > 0).length
      } avec une responsabilité active)`,
    );
    console.log(`[purge]   supprimables       : ${aSupprimer.length}`);

    const excel = path.resolve(
      __dirname,
      '..',
      '..',
      `membres-sans-compte-purge-${horodatage()}.xlsx`,
    );
    await exporterExcel(lignes, excel);
    console.log(`[purge] Export Excel (sélection complète) -> ${excel}`);

    if (uuidsReferences.size > 0 && !exclureReferences) {
      console.log('[purge] ⛔ Références présentes, suppression refusée :');
      for (const r of references) {
        console.log(`[purge]    ${r.table}.${r.column} : ${r.lignes} ligne(s)`);
      }
      console.log(
        '[purge] Relancer avec --exclure-references (ne supprimer que les non référencés) ' +
          'ou --purger-references (emporter responsabilités et accessoires avec le membre).',
      );
      return;
    }

    // Ce qui partira AVEC les membres : compté avant confirmation, parce qu'une responsabilité
    // supprimée laisse une structure sans responsable.
    let rattachements: Array<{ table: string; lignes: number }> = [];
    if (purgerReferences && aSupprimer.length > 0) {
      for (const { table, column } of TABLES_PURGEABLES) {
        const rows = await ds.query(
          `SELECT COUNT(*) AS n FROM \`${table}\` WHERE \`${column}\` IN (?)`,
          [aSupprimer.map((l) => l.uuid)],
        );
        const n = Number(rows?.[0]?.n ?? 0);
        if (n > 0) rattachements.push({ table, lignes: n });
      }
      for (const r of rattachements) {
        console.log(
          `[purge]   ⚠️ ${r.lignes} ligne(s) de ${r.table} seront supprimées avec les membres.`,
        );
      }
    }

    if (aSupprimer.length === 0) {
      console.log('[purge] Tous les membres sélectionnés sont référencés : rien à supprimer.');
      return;
    }

    if (!confirme || dryRun) {
      console.log(
        `[purge] ${dryRun ? '--dry-run' : 'Confirmation absente'} : aucune suppression. ` +
          `Relancer avec --confirm pour supprimer définitivement les ${aSupprimer.length} ligne(s).`,
      );
      return;
    }

    const uuids = aSupprimer.map((l) => l.uuid);
    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      let backupFile: string | null = null;
      if (backup) {
        const backupDir = path.resolve(__dirname, '..', '..', 'backups');
        fs.mkdirSync(backupDir, { recursive: true });
        backupFile = path.join(backupDir, `membres-sans-compte-${horodatage()}.json`);
        // Lignes BRUTES de `members` : c'est ce qu'il faudrait ré-insérer pour revenir en arrière.
        const brutes = await runner.manager.query(
          `SELECT * FROM members WHERE uuid IN (?)`,
          [uuids],
        );
        // Les rattachements emportés sont sauvegardés AVEC les membres : sans eux, restaurer
        // une fiche ne rendrait pas sa responsabilité à la personne.
        const sauvegarde: Record<string, unknown[]> = { members: brutes };
        if (purgerReferences) {
          for (const { table, column } of TABLES_PURGEABLES) {
            sauvegarde[table] = await runner.manager.query(
              `SELECT * FROM \`${table}\` WHERE \`${column}\` IN (?)`,
              [uuids],
            );
          }
        }
        fs.writeFileSync(backupFile, JSON.stringify(sauvegarde, null, 1), 'utf8');
      }

      // Rattachements d'abord (enfant -> parent) : un `member_responsibilities` qui survivrait
      // à son membre serait exactement l'orphelin que tout ce seed cherche à éviter.
      if (purgerReferences) {
        for (const { table, column } of TABLES_PURGEABLES) {
          for (let i = 0; i < uuids.length; i += 500) {
            const lot = uuids.slice(i, i + 500);
            const res = await runner.manager.query(
              `DELETE FROM \`${table}\` WHERE \`${column}\` IN (?)`,
              [lot],
            );
            const n = Number(res?.affectedRows ?? 0);
            if (n > 0) console.log(`[purge]   ${table} : ${n} ligne(s) supprimée(s).`);
          }
        }
      }

      let supprimes = 0;
      for (let i = 0; i < uuids.length; i += 500) {
        const lot = uuids.slice(i, i + 500);
        const res = await runner.manager.query(
          `DELETE FROM \`members\` WHERE \`uuid\` IN (?)`,
          [lot],
        );
        supprimes += Number(res?.affectedRows ?? 0);
      }

      await runner.commitTransaction();
      console.log(`[purge] ${supprimes} membre(s) supprimé(s) définitivement.`);
      if (backupFile) {
        console.log(`[purge] Sauvegarde JSON (seul retour arrière) : ${backupFile}`);
      }
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
  console.error('[purge] Échec :', err);
  process.exit(1);
});
