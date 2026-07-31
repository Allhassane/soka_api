import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';
import { User } from '../users/entities/user.entity';

/**
 * SEED - CRÉATION des comptes `users` manquants pour les membres qui n'en ont pas.
 *
 * Rejoue, sur les membres déjà en base, exactement la règle que `member.service.ts` applique à
 * la création d'un membre : **un compte n'est créé que si le membre a un téléphone, et que ce
 * téléphone n'est pas déjà pris.** Le numéro EST l'identifiant de connexion
 * (`users.phone_number` est UNIQUE) - sans lui, le compte serait inutilisable.
 *
 * ── Ce que reçoit le nouveau compte ──────────────────────────────────────────────────────
 *  - `password` = `DEFAULT_PASSWORD` (défaut `nrh2030`), **haché par le hook `@BeforeInsert`**
 *    de l'entité : le seed passe donc par le repository, jamais par un `INSERT` SQL brut, sinon
 *    le mot de passe serait stocké en clair et la connexion échouerait ;
 *  - `must_change_password: true` → à la première connexion, `auth.service` génère un vrai mot
 *    de passe et l'envoie **par SMS**. **Aucun SMS n'est envoyé par ce seed** ;
 *  - aucun rôle : l'API applique le repli « MEMBRE » pour un compte sans rôle.
 *
 * ── Les trois cas où un membre est écarté ────────────────────────────────────────────────
 *  - **sans téléphone** : aucun identifiant de connexion possible ;
 *  - **téléphone déjà porté par un compte existant** : la contrainte UNIQUE l'interdit. ⚠️ Au
 *    2026-07-30, 23 de ces 37 cas portent le **même nom de famille** que le titulaire du compte :
 *    ce sont vraisemblablement des comptes déjà existants dont `users.member_uuid` pointe sur un
 *    autre membre - à **re-lier**, pas à recréer. Ce seed ne touche pas à ces liens ;
 *  - **téléphone partagé avec un autre membre du lot** : le premier traité prend le numéro, le
 *    second est écarté (ce sont des numéros de famille, pas des doublons de fiche).
 *
 * Exécution (depuis api/) :
 *   npm run seed:create-missing-user-accounts -- --dry-run
 *   npm run seed:create-missing-user-accounts -- --confirm
 */

const COLONNES: Array<{ champ: string; entete: string; largeur: number }> = [
  { champ: 'decision', entete: 'Décision', largeur: 30 },
  { champ: 'motif', entete: 'Motif', largeur: 42 },
  { champ: 'matricule', entete: 'Matricule', largeur: 14 },
  { champ: 'lastname', entete: 'Nom', largeur: 22 },
  { champ: 'firstname', entete: 'Prénom', largeur: 24 },
  { champ: 'phone', entete: 'Téléphone (identifiant)', largeur: 20 },
  { champ: 'email', entete: 'E-mail', largeur: 26 },
  { champ: 'structure_name', entete: 'Structure', largeur: 26 },
  { champ: 'uuid', entete: 'Membre (uuid)', largeur: 38 },
  { champ: 'user_uuid', entete: 'Compte créé (uuid)', largeur: 38 },
];

function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

async function exporterExcel(lignes: any[], fichier: string): Promise<void> {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'SOKA - seed create-missing-user-accounts';
  classeur.created = new Date();
  const feuille = classeur.addWorksheet('Comptes créés');
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
        argb: String(ligne.decision).startsWith('compte') ? 'FFE8F5E9' : 'FFFFE9C8',
      },
    };
  }

  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  await classeur.xlsx.writeFile(fichier);
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const confirme = process.argv.includes('--confirm');
  const motDePasse = process.env.DEFAULT_PASSWORD || 'nrh2030';

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[comptes] Base cible : ${ds.options.database as string}`);

  try {
    const membres: any[] = await ds.query(
      `SELECT m.uuid, m.matricule, m.firstname, m.lastname, m.phone, m.email,
              s.name AS structure_name
         FROM members m
         LEFT JOIN structures s ON s.uuid = m.structure_uuid
        WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.member_uuid = m.uuid)
        ORDER BY m.id`,
    );

    // Numéros et e-mails déjà pris : chargés une fois, puis tenus à jour au fil des créations.
    // Relire la base à chaque membre coûterait 2 requêtes × 200 pour rien.
    const telephonesPris = new Set<string>(
      (await ds.query('SELECT phone_number FROM users WHERE phone_number IS NOT NULL')).map(
        (r: any) => String(r.phone_number).trim(),
      ),
    );
    const emailsPris = new Set<string>(
      (
        await ds.query("SELECT email FROM users WHERE email IS NOT NULL AND email <> ''")
      ).map((r: any) => String(r.email).trim().toLowerCase()),
    );

    const rapport: any[] = [];
    const aCreer: any[] = [];

    for (const m of membres) {
      const tel = String(m.phone ?? '').trim();
      if (tel === '') {
        rapport.push({
          ...m,
          decision: 'écarté',
          motif: 'sans téléphone - aucun identifiant de connexion possible',
        });
        continue;
      }
      if (telephonesPris.has(tel)) {
        rapport.push({
          ...m,
          decision: 'écarté',
          motif: 'téléphone déjà porté par un compte (contrainte UNIQUE)',
        });
        continue;
      }

      const email = String(m.email ?? '').trim();
      const emailLibre = email !== '' && !emailsPris.has(email.toLowerCase());

      telephonesPris.add(tel);
      if (emailLibre) emailsPris.add(email.toLowerCase());

      aCreer.push({ ...m, emailRetenu: emailLibre ? email : null });
      rapport.push({
        ...m,
        decision: 'compte à créer',
        motif: emailLibre ? '' : email !== '' ? 'e-mail déjà pris → laissé vide' : '',
      });
    }

    console.log(`[comptes] Membres sans compte : ${membres.length}`);
    console.log(`[comptes]   comptes créables  : ${aCreer.length}`);
    console.log(
      `[comptes]   écartés           : ${rapport.filter((r) => r.decision === 'écarté').length}`,
    );

    if (!confirme || dryRun) {
      const fichier = path.resolve(
        __dirname,
        '..',
        '..',
        `comptes-a-creer-${horodatage()}.xlsx`,
      );
      await exporterExcel(rapport, fichier);
      console.log(`[comptes] Export Excel -> ${fichier}`);
      console.log(
        `[comptes] ${dryRun ? '--dry-run' : 'Confirmation absente'} : aucun compte créé. ` +
          'Relancer avec --confirm.',
      );
      return;
    }

    const runner = ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      for (const m of aCreer) {
        // `manager.save` sur une ENTITÉ : indispensable pour que `@BeforeInsert` hache le mot
        // de passe et génère l'uuid. Un INSERT SQL stockerait « nrh2030 » en clair.
        const compte = runner.manager.create(User, {
          firstname: m.firstname ?? undefined,
          lastname: m.lastname ?? undefined,
          email: m.emailRetenu ?? undefined,
          phone_number: String(m.phone).trim(),
          password: motDePasse,
          is_active: true,
          member_uuid: m.uuid,
          must_change_password: true,
        });
        const enregistre = await runner.manager.save(compte);
        const ligne = rapport.find((r) => r.uuid === m.uuid);
        if (ligne) {
          ligne.decision = 'compte créé';
          ligne.user_uuid = enregistre.uuid;
        }
      }

      await runner.commitTransaction();
      console.log(`[comptes] ${aCreer.length} compte(s) créé(s).`);
      console.log(
        '[comptes] Mot de passe par défaut + must_change_password : le vrai mot de passe part ' +
          'par SMS à la première tentative de connexion. Aucun SMS envoyé par ce seed.',
      );
    } catch (err) {
      await runner.rollbackTransaction();
      throw err;
    } finally {
      await runner.release();
    }

    const fichier = path.resolve(
      __dirname,
      '..',
      '..',
      `comptes-crees-${horodatage()}.xlsx`,
    );
    await exporterExcel(rapport, fichier);
    console.log(`[comptes] Export Excel -> ${fichier}`);
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[comptes] Échec :', err);
  process.exit(1);
});
