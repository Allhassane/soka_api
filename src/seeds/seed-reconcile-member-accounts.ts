import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import { DataSource, EntityManager } from 'typeorm';
import AppDataSource from '../data-source';
import { User } from '../users/entities/user.entity';
import { Role } from '../roles/entities/role.entity';
import { UserRole } from '../user-roles/entities/user-roles.entity';
import { MemberAccountService } from '../users/member-account.service';
import { UserRoleService } from '../user-roles/user-roles.service';

/**
 * SEED - RÉGULARISATION de l'écart entre `members` et `users`.
 *
 * Un membre doit avoir exactement **un** compte de connexion, et un compte de connexion doit
 * pointer sur un membre vivant. Quand les deux comptes ne tombent pas juste, l'écart n'est
 * jamais d'un seul type : ce seed le **décompose**, corrige ce qui est corrigeable sans
 * arbitrage, et **signale le reste** au lieu de le deviner.
 *
 * ── Ce qui est CORRIGÉ (avec `--apply`) ──────────────────────────────────────────────────
 *  1. **Membre vivant sans aucun compte** → compte créé, puis sa ligne `user_roles`.
 *     C'est la conséquence directe du trou d'import refermé le 2026-08-01 (`ImportService`
 *     écrivait le membre seul) : 360 membres s'étaient accumulés ainsi.
 *  2. **Compte encore actif rattaché à un membre supprimé** → `is_active = 0`.
 *     Sans ça la personne peut encore demander son mot de passe par SMS et se connecter
 *     (anomalie F1 de la recette du 2026-07-31). **Désactivation, jamais suppression** : la
 *     suppression d'un membre est logique, le compte doit pouvoir suivre une restauration.
 *  3. **Compte sans aucune ligne `user_roles`** → rôle par défaut **MEMBRE**
 *     (ADMINISTRATEUR si `is_admin`), via `UserRoleService.ensureDefaultRole()`.
 *     ⚠️ **Purement additif** : seules des lignes MANQUANTES sont insérées. Aucun rôle existant
 *     n'est corrigé, désactivé ni supprimé - c'est ce qui distingue ce seed de
 *     `scripts/seed-user-roles.js`, convergent et donc destructif par construction. Sur une
 *     base en production, la différence est décisive.
 *
 * ── Ce qui est SEULEMENT SIGNALÉ (jamais corrigé automatiquement) ────────────────────────
 *  Chacun de ces cas demande une décision humaine, et se tromper coûte plus cher que l'écart :
 *  - **compte sans `member_uuid`** : ce sont les comptes techniques / l'administrateur. Les
 *    rattacher au hasard ou les supprimer ferme l'accès à la plateforme ;
 *  - **compte dont le `member_uuid` ne pointe sur rien** (fiche effacée physiquement) :
 *    supprimer le compte détruirait la seule trace de la personne ;
 *  - **membre dont le seul compte est soft-deleted** : restaurer ≠ recréer. En recréer un
 *    poserait un **second** compte sur le même numéro (`users.phone_number` n'a AUCUN index
 *    UNIQUE en base) et rendrait la connexion ambiguë ;
 *  - **compte dont la ligne `user_roles` est inactive ou supprimée** : même raisonnement, à
 *    **réactiver**. En insérer une seconde passerait (aucun index unique sur
 *    `(user_uuid, role_uuid)`) et `findUserRoles` renverrait alors **deux rôles** ;
 *  - **membre portant plusieurs comptes** / **numéro partagé par plusieurs comptes** : choisir
 *    lequel survit est un arbitrage métier.
 *
 * ── Les règles de création ne sont PAS réécrites ici ─────────────────────────────────────
 * Le seed instancie le vrai **`MemberAccountService`** (point unique documenté dans
 * `CLAUDE.md`) : mêmes garde-fous que le formulaire et l'import - pas de téléphone ⇒ pas de
 * compte, numéro déjà pris ⇒ compte non créé, e-mail déjà pris ⇒ laissé vide, mot de passe
 * **haché** par le hook `@BeforeInsert` (jamais d'`INSERT` SQL brut, qui le stockerait en clair).
 * Une copie locale de ces règles divergerait en silence.
 *
 * ⚠️ Le seed tourne **hors contexte NestJS** : `UserDefaultRoleSubscriber` ne s'y déclenche pas.
 * C'est ce qui avait laissé 197 comptes sans ligne `user_roles` le 2026-07-30. Le seed appelle
 * donc `UserRoleService.ensureDefaultRole()` lui-même, pour chaque compte qu'il crée.
 *
 * ⚠️ Aucun SMS n'est envoyé. Les comptes naissent avec le mot de passe par défaut et
 * `must_change_password = true` : le vrai mot de passe part à la 1re tentative de connexion.
 *
 * Exécution (depuis api/) :
 *   npm run seed:reconcile-member-accounts              # simulation (défaut) - n'écrit RIEN
 *   npm run seed:reconcile-member-accounts -- --apply   # applique les corrections 1 et 2
 */

/** Écritures groupées par paquets : cf. `appliquerCreations()` pour la raison. */
const TAILLE_LOT = 200;

interface LigneMembre {
  uuid: string;
  matricule: string | null;
  firstname: string | null;
  lastname: string | null;
  phone: string | null;
  email: string | null;
  structure_name: string | null;
}

interface LigneRapport extends Partial<LigneMembre> {
  categorie: string;
  decision: string;
  motif: string;
  user_uuid?: string | null;
}

const COLONNES: Array<{ champ: keyof LigneRapport; entete: string; largeur: number }> = [
  { champ: 'categorie', entete: 'Catégorie', largeur: 34 },
  { champ: 'decision', entete: 'Décision', largeur: 26 },
  { champ: 'motif', entete: 'Motif', largeur: 52 },
  { champ: 'matricule', entete: 'Matricule', largeur: 14 },
  { champ: 'lastname', entete: 'Nom', largeur: 22 },
  { champ: 'firstname', entete: 'Prénom', largeur: 24 },
  { champ: 'phone', entete: 'Téléphone (identifiant)', largeur: 20 },
  { champ: 'email', entete: 'E-mail', largeur: 26 },
  { champ: 'structure_name', entete: 'Structure', largeur: 26 },
  { champ: 'uuid', entete: 'Membre (uuid)', largeur: 38 },
  { champ: 'user_uuid', entete: 'Compte (uuid)', largeur: 38 },
];

function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ─────────────────────────────────── diagnostic ───────────────────────────────────

/**
 * Le comptage brut que l'utilisateur voit (`members` vs `users`) et sa **décomposition**.
 * Toutes les requêtes ignorent les lignes soft-deleted des deux côtés : un membre supprimé
 * n'est pas censé peser dans l'écart, et un compte supprimé ne connecte personne.
 */
async function diagnostiquer(ds: DataSource): Promise<Record<string, number>> {
  const scalaires: Array<[string, string]> = [
    ['membres_vivants', 'SELECT COUNT(*) v FROM members WHERE deleted_at IS NULL'],
    ['comptes_vivants', 'SELECT COUNT(*) v FROM users WHERE deleted_at IS NULL'],
    [
      'membres_sans_aucun_compte',
      `SELECT COUNT(*) v FROM members m
        WHERE m.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.member_uuid = m.uuid)`,
    ],
    [
      'membres_compte_supprime',
      `SELECT COUNT(*) v FROM members m
        WHERE m.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM users u WHERE u.member_uuid = m.uuid AND u.deleted_at IS NOT NULL)
          AND NOT EXISTS (SELECT 1 FROM users u WHERE u.member_uuid = m.uuid AND u.deleted_at IS NULL)`,
    ],
    [
      'comptes_sans_member_uuid',
      `SELECT COUNT(*) v FROM users
        WHERE deleted_at IS NULL AND (member_uuid IS NULL OR member_uuid = '')`,
    ],
    [
      'comptes_membre_introuvable',
      `SELECT COUNT(*) v FROM users u
        WHERE u.deleted_at IS NULL AND u.member_uuid IS NOT NULL AND u.member_uuid <> ''
          AND NOT EXISTS (SELECT 1 FROM members m WHERE m.uuid = u.member_uuid)`,
    ],
    [
      'comptes_actifs_sur_membre_supprime',
      `SELECT COUNT(*) v FROM users u
         JOIN members m ON m.uuid = u.member_uuid
        WHERE u.deleted_at IS NULL AND u.is_active = 1 AND m.deleted_at IS NOT NULL`,
    ],
    [
      'membres_multi_comptes',
      `SELECT COUNT(*) v FROM (
         SELECT member_uuid FROM users
          WHERE deleted_at IS NULL AND member_uuid IS NOT NULL AND member_uuid <> ''
          GROUP BY member_uuid HAVING COUNT(*) > 1) t`,
    ],
    [
      'telephones_partages',
      `SELECT COUNT(*) v FROM (
         SELECT phone_number FROM users
          WHERE deleted_at IS NULL AND phone_number IS NOT NULL AND phone_number <> ''
          GROUP BY phone_number HAVING COUNT(*) > 1) t`,
    ],
    // « Servi » au sens de `EffectivePermissionsService` : une ligne ne compte que si elle est
    // `is_active = 1` ET non supprimée. Le total se scinde en deux cas qui n'ont pas le même
    // remède - d'où deux compteurs plutôt qu'un.
    [
      'comptes_sans_role_actif',
      `SELECT COUNT(*) v FROM users u
        WHERE u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM user_roles ur
                           WHERE ur.user_uuid = u.uuid AND ur.deleted_at IS NULL AND ur.is_active = 1)`,
    ],
    [
      'comptes_sans_aucune_ligne_role',
      `SELECT COUNT(*) v FROM users u
        WHERE u.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_uuid = u.uuid)`,
    ],
    [
      'comptes_role_inactif_ou_supprime',
      `SELECT COUNT(*) v FROM users u
        WHERE u.deleted_at IS NULL
          AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_uuid = u.uuid)
          AND NOT EXISTS (SELECT 1 FROM user_roles ur
                           WHERE ur.user_uuid = u.uuid AND ur.deleted_at IS NULL AND ur.is_active = 1)`,
    ],
  ];

  const resultat: Record<string, number> = {};
  for (const [cle, sql] of scalaires) {
    const rows = await ds.query(sql);
    resultat[cle] = Number(rows?.[0]?.v ?? 0);
  }
  return resultat;
}

function afficherDiagnostic(d: Record<string, number>, titre: string): void {
  const ecart = d.membres_vivants - d.comptes_vivants;
  console.log(`\n[réconciliation] ── ${titre} ──`);
  console.log(`[réconciliation] membres vivants : ${d.membres_vivants}`);
  console.log(`[réconciliation] comptes vivants : ${d.comptes_vivants}`);
  console.log(
    `[réconciliation] ÉCART           : ${ecart > 0 ? '+' : ''}${ecart} ` +
      `(${ecart === 0 ? 'aligné' : ecart > 0 ? 'membres en trop' : 'comptes en trop'})`,
  );
  console.log('[réconciliation] décomposition :');
  console.log(`[réconciliation]   membre vivant sans aucun compte ....... ${d.membres_sans_aucun_compte}  → CORRIGÉ (création)`);
  console.log(`[réconciliation]   compte actif sur un membre supprimé ... ${d.comptes_actifs_sur_membre_supprime}  → CORRIGÉ (désactivation)`);
  console.log(`[réconciliation]   membre dont le seul compte est supprimé ${d.membres_compte_supprime}  → signalé`);
  console.log(`[réconciliation]   compte sans member_uuid .............. ${d.comptes_sans_member_uuid}  → signalé`);
  console.log(`[réconciliation]   compte dont le membre est introuvable . ${d.comptes_membre_introuvable}  → signalé`);
  console.log(`[réconciliation]   membre portant plusieurs comptes ...... ${d.membres_multi_comptes}  → signalé`);
  console.log(`[réconciliation]   numéro partagé par plusieurs comptes .. ${d.telephones_partages}  → signalé`);
  console.log(`[réconciliation] rôles (user_roles) - compte sans rôle actif : ${d.comptes_sans_role_actif}`);
  console.log(`[réconciliation]   dont AUCUNE ligne du tout ............ ${d.comptes_sans_aucune_ligne_role}  → CORRIGÉ (rôle MEMBRE)`);
  console.log(`[réconciliation]   dont ligne inactive ou supprimée ..... ${d.comptes_role_inactif_ou_supprime}  → signalé`);
}

// ─────────────────────────────────── collectes ───────────────────────────────────

async function membresSansAucunCompte(ds: DataSource): Promise<LigneMembre[]> {
  return ds.query(
    `SELECT m.uuid, m.matricule, m.firstname, m.lastname, m.phone, m.email,
            s.name AS structure_name
       FROM members m
       LEFT JOIN structures s ON s.uuid = m.structure_uuid
      WHERE m.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.member_uuid = m.uuid)
      ORDER BY m.id`,
  );
}

/**
 * Comptes vivants ne portant **aucune** ligne `user_roles` - pas même supprimée.
 *
 * Le critère est volontairement « aucune ligne », et non « aucune ligne active » : c'est celui
 * de `UserRoleService.ensureDefaultRole()`, qui refuse d'écrire dès qu'une ligne existe. Un
 * compte dont la ligne est seulement inactive ou soft-deleted doit être **réactivé**, pas
 * doublé - `user_roles` n'a aucun index unique sur `(user_uuid, role_uuid)`, une seconde ligne
 * passerait, et `findUserRoles` renverrait alors **deux rôles** pour un même compte.
 */
async function comptesSansAucuneLigneRole(ds: DataSource): Promise<any[]> {
  return ds.query(
    `SELECT u.uuid AS user_uuid, u.is_admin, u.firstname, u.lastname,
            u.phone_number AS phone, u.email, u.member_uuid AS uuid
       FROM users u
      WHERE u.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_uuid = u.uuid)
      ORDER BY u.id`,
  );
}

async function anomaliesSignalees(ds: DataSource): Promise<LigneRapport[]> {
  const lignes: LigneRapport[] = [];

  const roleInerte: any[] = await ds.query(
    `SELECT u.uuid AS user_uuid, u.firstname, u.lastname, u.phone_number AS phone,
            u.member_uuid AS uuid,
            (SELECT GROUP_CONCAT(CONCAT(r.slug, CASE WHEN ur.deleted_at IS NOT NULL THEN ' (supprimée)'
                                                     WHEN ur.is_active <> 1 THEN ' (inactive)'
                                                     ELSE '' END))
               FROM user_roles ur LEFT JOIN roles r ON r.uuid = ur.role_uuid
              WHERE ur.user_uuid = u.uuid) AS lignes_existantes
       FROM users u
      WHERE u.deleted_at IS NULL
        AND EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_uuid = u.uuid)
        AND NOT EXISTS (SELECT 1 FROM user_roles ur
                         WHERE ur.user_uuid = u.uuid AND ur.deleted_at IS NULL AND ur.is_active = 1)
      ORDER BY u.id`,
  );
  for (const r of roleInerte) {
    lignes.push({
      ...r,
      categorie: 'compte : rôle inactif ou supprimé',
      decision: 'à arbitrer',
      motif:
        `lignes en base : ${r.lignes_existantes ?? '?'} - RÉACTIVER (is_active = 1, deleted_at = NULL) ` +
        'plutôt qu’en ajouter une seconde : aucun index unique ne l’empêcherait',
    });
  }

  const compteSupprime: any[] = await ds.query(
    `SELECT m.uuid, m.matricule, m.firstname, m.lastname, m.phone, m.email,
            s.name AS structure_name, u.uuid AS user_uuid
       FROM members m
       LEFT JOIN structures s ON s.uuid = m.structure_uuid
       JOIN users u ON u.member_uuid = m.uuid AND u.deleted_at IS NOT NULL
      WHERE m.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.member_uuid = m.uuid AND u2.deleted_at IS NULL)
      ORDER BY m.id`,
  );
  for (const r of compteSupprime) {
    lignes.push({
      ...r,
      categorie: 'membre : seul compte soft-deleted',
      decision: 'à arbitrer',
      motif:
        'restaurer le compte (UPDATE users SET deleted_at = NULL) plutôt qu’en créer un second sur le même numéro',
    });
  }

  const sansMembre: any[] = await ds.query(
    `SELECT u.uuid AS user_uuid, u.firstname, u.lastname, u.phone_number AS phone, u.email,
            u.is_admin, u.is_active
       FROM users u
      WHERE u.deleted_at IS NULL AND (u.member_uuid IS NULL OR u.member_uuid = '')
      ORDER BY u.id`,
  );
  for (const r of sansMembre) {
    lignes.push({
      ...r,
      categorie: 'compte : sans member_uuid',
      decision: 'à arbitrer',
      motif: r.is_admin
        ? 'compte ADMINISTRATEUR - normal, à conserver tel quel'
        : 'compte technique ou lien perdu : rattacher à une fiche, ou laisser',
    });
  }

  const membreIntrouvable: any[] = await ds.query(
    `SELECT u.uuid AS user_uuid, u.firstname, u.lastname, u.phone_number AS phone, u.email,
            u.member_uuid
       FROM users u
      WHERE u.deleted_at IS NULL AND u.member_uuid IS NOT NULL AND u.member_uuid <> ''
        AND NOT EXISTS (SELECT 1 FROM members m WHERE m.uuid = u.member_uuid)
      ORDER BY u.id`,
  );
  for (const r of membreIntrouvable) {
    lignes.push({
      ...r,
      uuid: r.member_uuid,
      categorie: 'compte : membre introuvable',
      decision: 'à arbitrer',
      motif: 'la fiche membre a été effacée physiquement - le compte est la dernière trace',
    });
  }

  const multiComptes: any[] = await ds.query(
    `SELECT u.member_uuid AS uuid, GROUP_CONCAT(u.uuid) AS comptes, COUNT(*) AS n,
            MAX(u.phone_number) AS phone
       FROM users u
      WHERE u.deleted_at IS NULL AND u.member_uuid IS NOT NULL AND u.member_uuid <> ''
      GROUP BY u.member_uuid HAVING COUNT(*) > 1`,
  );
  for (const r of multiComptes) {
    lignes.push({
      uuid: r.uuid,
      phone: r.phone,
      user_uuid: r.comptes,
      categorie: 'membre : plusieurs comptes',
      decision: 'à arbitrer',
      motif: `${r.n} comptes sur la même fiche - garder celui qui porte le bon numéro, soft-deleter l’autre`,
    });
  }

  const telPartages: any[] = await ds.query(
    `SELECT u.phone_number AS phone, GROUP_CONCAT(u.uuid) AS comptes, COUNT(*) AS n
       FROM users u
      WHERE u.deleted_at IS NULL AND u.phone_number IS NOT NULL AND u.phone_number <> ''
      GROUP BY u.phone_number HAVING COUNT(*) > 1`,
  );
  for (const r of telPartages) {
    lignes.push({
      phone: r.phone,
      user_uuid: r.comptes,
      categorie: 'compte : numéro partagé',
      decision: 'à arbitrer',
      motif: `${r.n} comptes sur ce numéro - la connexion est ambiguë (aucun index UNIQUE en base)`,
    });
  }

  return lignes;
}

// ─────────────────────────────────── écritures ───────────────────────────────────

/**
 * Écrit par paquets, une transaction par paquet, **et non une transaction unique** : un compte
 * créé est valide indépendamment des autres, tandis qu'une transaction couvrant plusieurs
 * milliers d'insertions (chacune payant un hachage bcrypt) tiendrait des verrous bien trop
 * longtemps sur la base de production. Une interruption laisse donc les paquets déjà validés
 * en place - le seed étant idempotent, il suffit de le relancer.
 */
async function appliquerCreations(
  ds: DataSource,
  candidats: LigneMembre[],
  rapport: LigneRapport[],
  memberAccounts: MemberAccountService,
  userRoles: UserRoleService,
): Promise<void> {
  let traites = 0;

  for (let debut = 0; debut < candidats.length; debut += TAILLE_LOT) {
    const lot = candidats.slice(debut, debut + TAILLE_LOT);

    await ds.transaction(async (trx: EntityManager) => {
      for (const m of lot) {
        const verdict = await memberAccounts.reconcileAccount(
          {
            uuid: m.uuid,
            firstname: m.firstname,
            lastname: m.lastname,
            email: m.email,
            phone: m.phone,
          },
          trx,
        );

        const ligne = rapport.find((r) => r.uuid === m.uuid && r.categorie.startsWith('membre : sans compte'));
        if (!ligne) continue;

        if (verdict !== 'created') {
          ligne.decision = 'écarté';
          ligne.motif =
            verdict === 'skipped_no_phone'
              ? 'sans téléphone - le numéro EST l’identifiant de connexion'
              : verdict === 'skipped_phone_taken'
                ? 'numéro déjà porté par un autre compte - un 2e compte rendrait la connexion ambiguë'
                : `verdict inattendu du service : ${verdict}`;
          continue;
        }

        // Hors contexte Nest, `UserDefaultRoleSubscriber` ne se déclenche pas : la ligne
        // `user_roles` est posée ici, dans la MÊME transaction que le compte.
        const cree = await trx.findOne(User, { where: { member_uuid: m.uuid } });
        if (cree) {
          await userRoles.ensureDefaultRole(trx, cree);
          ligne.user_uuid = cree.uuid;
        }
        ligne.decision = 'compte créé';
        ligne.motif = '';
      }
    });

    traites += lot.length;
    console.log(`[réconciliation]   … ${traites}/${candidats.length} membre(s) traité(s)`);
  }
}

/**
 * Pose le **rôle par défaut** sur les comptes qui n'ont aucune ligne `user_roles`.
 *
 * **MEMBRE pour tous, ADMINISTRATEUR pour un compte `is_admin`** - c'est la précédence de
 * `UserRoleService.ensureDefaultRole()`, réutilisée telle quelle plutôt que recopiée. Donner
 * MEMBRE à l'administrateur inverserait l'invariant sur le seul compte qui ne peut pas se le
 * permettre.
 *
 * **Purement additif : le seed n'INSÈRE que des lignes manquantes.** Il ne corrige aucun rôle
 * existant, n'en désactive ni n'en supprime aucun - contrairement à
 * `scripts/seed-user-roles.js`, qui est convergent et supprime les lignes hors population.
 * Sur une base de production, la différence est décisive.
 *
 * ⚠️ **Aucun droit n'est retiré au passage.** `EffectivePermissionsService` fait l'**UNION** de
 * trois sources - `user_roles`, le rôle porté par les **responsabilités**, celui porté par les
 * **comités** - avant de retomber sur le repli MEMBRE. Ajouter une ligne ne peut donc
 * qu'élargir : un responsable qui reçoit MEMBRE ici garde ses droits de responsable, qui ne
 * transitaient pas par cette table. À sa prochaine connexion, `syncBaseRoleForMember` remplacera
 * cette ligne MEMBRE par RESPONSABLE - la table converge d'elle-même.
 */
async function appliquerRolesParDefaut(
  ds: DataSource,
  candidats: any[],
  rapport: LigneRapport[],
  userRoles: UserRoleService,
): Promise<number> {
  let poses = 0;

  for (let debut = 0; debut < candidats.length; debut += TAILLE_LOT) {
    const lot = candidats.slice(debut, debut + TAILLE_LOT);

    await ds.transaction(async (trx: EntityManager) => {
      for (const c of lot) {
        await userRoles.ensureDefaultRole(trx, {
          uuid: c.user_uuid,
          is_admin: Number(c.is_admin) === 1,
        });
      }
    });

    // `ensureDefaultRole` est silencieuse par conception (elle ne doit jamais faire échouer une
    // création de compte) : on recompte en base au lieu de croire à son retour.
    const uuids = lot.map((c) => c.user_uuid);
    const rows = await ds.query(
      `SELECT ur.user_uuid, r.slug
         FROM user_roles ur JOIN roles r ON r.uuid = ur.role_uuid
        WHERE ur.deleted_at IS NULL AND ur.is_active = 1 AND ur.user_uuid IN (?)`,
      [uuids],
    );
    const slugParUser = new Map<string, string>(
      (rows ?? []).map((r: any) => [r.user_uuid, r.slug]),
    );

    for (const c of lot) {
      const slug = slugParUser.get(c.user_uuid);
      rapport.push({
        uuid: c.uuid,
        phone: c.phone,
        firstname: c.firstname,
        lastname: c.lastname,
        email: c.email,
        user_uuid: c.user_uuid,
        categorie: 'compte : sans ligne user_roles',
        decision: slug ? `rôle posé : ${slug}` : 'ÉCHEC',
        motif: slug
          ? ''
          : 'aucune ligne écrite - les rôles `membre` / `administrateur` existent-ils en base ?',
      });
      if (slug) poses++;
    }

    console.log(
      `[réconciliation]   … ${Math.min(debut + lot.length, candidats.length)}/${candidats.length} compte(s) traité(s)`,
    );
  }

  return poses;
}

/**
 * Aligne sur la règle posée par la recette du 2026-07-31 (F1) : un membre supprimé ne doit plus
 * pouvoir se connecter ni recevoir son mot de passe par SMS. `is_active = 0` ferme les deux
 * portes (`validateUser` refuse, `requestPasswordReset` n'envoie rien) et reste réversible.
 */
async function desactiverComptesDeMembresSupprimes(
  ds: DataSource,
  rapport: LigneRapport[],
): Promise<number> {
  const cibles: any[] = await ds.query(
    `SELECT u.uuid AS user_uuid, u.phone_number AS phone, u.firstname, u.lastname,
            m.uuid, m.matricule
       FROM users u
       JOIN members m ON m.uuid = u.member_uuid
      WHERE u.deleted_at IS NULL AND u.is_active = 1 AND m.deleted_at IS NOT NULL`,
  );
  if (!cibles.length) return 0;

  // Le pilote MySQL rend un `ResultSetHeader` (`affectedRows`), pas l'`affected` de TypeORM.
  const entete = await ds.query(
    `UPDATE users u
       JOIN members m ON m.uuid = u.member_uuid
        SET u.is_active = 0, u.updated_at = NOW(6)
      WHERE u.deleted_at IS NULL AND u.is_active = 1 AND m.deleted_at IS NOT NULL`,
  );

  for (const c of cibles) {
    rapport.push({
      ...c,
      categorie: 'compte : membre supprimé',
      decision: 'compte désactivé',
      motif: 'is_active = 0 - la personne ne peut plus se connecter ni demander son mot de passe',
    });
  }
  return Number(entete?.affectedRows ?? cibles.length);
}

// ──────────────────────────────────── export ────────────────────────────────────

async function exporterExcel(lignes: LigneRapport[], diagAvant: Record<string, number>, diagApres: Record<string, number>, fichier: string): Promise<void> {
  const classeur = new ExcelJS.Workbook();
  classeur.creator = 'SOKA - seed reconcile-member-accounts';
  classeur.created = new Date();

  const synthese = classeur.addWorksheet('Synthèse');
  synthese.columns = [
    { header: 'Indicateur', key: 'k', width: 44 },
    { header: 'Avant', key: 'avant', width: 12 },
    { header: 'Après', key: 'apres', width: 12 },
  ];
  synthese.getRow(1).font = { bold: true };
  for (const cle of Object.keys(diagAvant)) {
    synthese.addRow({ k: cle, avant: diagAvant[cle], apres: diagApres[cle] });
  }
  synthese.addRow({
    k: 'ÉCART (membres - comptes)',
    avant: diagAvant.membres_vivants - diagAvant.comptes_vivants,
    apres: diagApres.membres_vivants - diagApres.comptes_vivants,
  });

  const detail = classeur.addWorksheet('Détail');
  detail.columns = COLONNES.map((c) => ({ header: c.entete, key: String(c.champ), width: c.largeur }));
  detail.getRow(1).font = { bold: true };
  detail.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EDF5' } };
  detail.views = [{ state: 'frozen', ySplit: 1 }];
  detail.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLONNES.length } };

  for (const ligne of lignes) {
    const cellule: Record<string, unknown> = {};
    for (const { champ } of COLONNES) {
      const v: unknown = ligne[champ];
      cellule[String(champ)] = v instanceof Date ? v.toISOString() : v;
    }
    const row = detail.addRow(cellule);
    const couleur = ligne.decision.startsWith('compte créé')
      ? 'FFE8F5E9'
      : ligne.decision === 'à arbitrer'
        ? 'FFFDE7E7'
        : 'FFFFE9C8';
    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: couleur } };
  }

  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  await classeur.xlsx.writeFile(fichier);
}

// ───────────────────────────────────── main ─────────────────────────────────────

async function run(): Promise<void> {
  const applique = process.argv.includes('--apply');

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[réconciliation] Base cible : ${ds.options.database as string}`);
  console.log(
    `[réconciliation] Mode : ${applique ? '⚠️  APPLICATION (écriture en base)' : 'SIMULATION (aucune écriture)'}`,
  );

  try {
    const diagAvant = await diagnostiquer(ds);
    afficherDiagnostic(diagAvant, 'ÉTAT AVANT');

    const candidats = await membresSansAucunCompte(ds);
    const rapport: LigneRapport[] = candidats.map((m) => ({
      ...m,
      categorie: 'membre : sans compte',
      decision: applique ? 'en cours' : 'compte à créer',
      motif: '',
    }));

    if (applique) {
      // Le vrai service, pas une copie de ses règles (cf. en-tête).
      const memberAccounts = new MemberAccountService(ds.getRepository(User));
      const userRoles = new UserRoleService(
        ds.getRepository(UserRole),
        ds.getRepository(User),
        ds.getRepository(Role),
        // Cache de droits : sans objet dans un script à usage unique (aucune API en vie
        // derrière), mais le constructeur l'exige - on passe un objet inerte plutôt qu'un
        // `null` qui exploserait au premier appel.
        { invalider: () => undefined } as any,
      );

      if (candidats.length) {
        console.log(`\n[réconciliation] Création des comptes manquants (${candidats.length})…`);
        await appliquerCreations(ds, candidats, rapport, memberAccounts, userRoles);
      }

      const desactives = await desactiverComptesDeMembresSupprimes(ds, rapport);
      if (desactives) {
        console.log(`[réconciliation] ${desactives} compte(s) de membre supprimé désactivé(s).`);
      }

      // Après les créations : les comptes qui viennent de naître ont déjà leur ligne, ils ne
      // seront donc pas repris ici.
      const sansRole = await comptesSansAucuneLigneRole(ds);
      if (sansRole.length) {
        console.log(`\n[réconciliation] Pose du rôle par défaut (${sansRole.length} compte(s) sans ligne user_roles)…`);
        const poses = await appliquerRolesParDefaut(ds, sansRole, rapport, userRoles);
        console.log(`[réconciliation] ${poses}/${sansRole.length} rôle(s) posé(s).`);
      }
    } else {
      // En simulation, on ne rejoue pas les garde-fous du service (ils lisent la base) : on
      // annonce seulement les cas que la règle écartera à coup sûr, pour que le décompte
      // affiché ne promette pas plus de comptes qu'il n'en sera créé.
      const telsPris = new Set<string>(
        (
          await ds.query(
            "SELECT phone_number FROM users WHERE deleted_at IS NULL AND phone_number IS NOT NULL AND phone_number <> ''",
          )
        ).map((r: any) => String(r.phone_number).trim()),
      );
      for (const ligne of rapport) {
        const tel = String(ligne.phone ?? '').trim();
        if (!tel) {
          ligne.decision = 'écarté';
          ligne.motif = 'sans téléphone - le numéro EST l’identifiant de connexion';
        } else if (telsPris.has(tel)) {
          ligne.decision = 'écarté';
          ligne.motif = 'numéro déjà porté par un autre compte';
        } else {
          telsPris.add(tel);
        }
      }
      const aCreer = rapport.filter((r) => r.decision === 'compte à créer').length;
      console.log(
        `\n[réconciliation] Simulation : ${aCreer} compte(s) créable(s), ` +
          `${rapport.length - aCreer} écarté(s) sur ${rapport.length} membre(s) sans compte.`,
      );

      const sansRole = await comptesSansAucuneLigneRole(ds);
      for (const c of sansRole) {
        rapport.push({
          uuid: c.uuid,
          phone: c.phone,
          firstname: c.firstname,
          lastname: c.lastname,
          email: c.email,
          user_uuid: c.user_uuid,
          categorie: 'compte : sans ligne user_roles',
          decision: `rôle à poser : ${Number(c.is_admin) === 1 ? 'administrateur' : 'membre'}`,
          motif: '',
        });
      }
      const admins = sansRole.filter((c) => Number(c.is_admin) === 1).length;
      console.log(
        `[réconciliation] Simulation : ${sansRole.length} rôle(s) à poser ` +
          `(membre = ${sansRole.length - admins}, administrateur = ${admins}).`,
      );
    }

    rapport.push(...(await anomaliesSignalees(ds)));

    const diagApres = applique ? await diagnostiquer(ds) : diagAvant;
    if (applique) afficherDiagnostic(diagApres, 'ÉTAT APRÈS');

    const fichier = path.resolve(
      __dirname,
      '..',
      '..',
      `reconciliation-membres-comptes-${horodatage()}.xlsx`,
    );
    await exporterExcel(rapport, diagAvant, diagApres, fichier);
    console.log(`\n[réconciliation] Export Excel -> ${fichier}`);

    if (!applique) {
      console.log('[réconciliation] Aucune écriture. Relancer avec --apply pour appliquer.');
    } else {
      console.log(
        '[réconciliation] Les comptes créés portent le mot de passe par défaut + ' +
          'must_change_password : le vrai mot de passe part par SMS à la 1re connexion. ' +
          'AUCUN SMS n’a été envoyé par ce seed.',
      );
      console.log(
        '[réconciliation] Rôles posés : effet visible après RECONNEXION côté écran ' +
          '(`global_permissions` est calculé au login) ; côté API, sous 30 s (cache des droits).',
      );
      if (diagApres.comptes_sans_aucune_ligne_role > 0) {
        console.log(
          `[réconciliation] ⚠️  ${diagApres.comptes_sans_aucune_ligne_role} compte(s) restent sans ` +
            'aucune ligne `user_roles` : vérifier que les rôles `membre` / `administrateur` ' +
            'existent bien dans `roles` (`node scripts/setup-3-roles.js`).',
        );
      }
      if (diagApres.comptes_role_inactif_ou_supprime > 0) {
        console.log(
          `[réconciliation] ⚠️  ${diagApres.comptes_role_inactif_ou_supprime} compte(s) ont une ligne ` +
            '`user_roles` inactive ou supprimée - à RÉACTIVER (voir le rapport), non traité ici.',
        );
      }
    }
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[réconciliation] Échec :', err);
  process.exit(1);
});
