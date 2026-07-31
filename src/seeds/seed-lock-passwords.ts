import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import AppDataSource from '../data-source';

/**
 * SEED - VERROUILLAGE des mots de passe : chaque compte reçoit un secret long et aléatoire,
 * et `must_change_password` passe à 0.
 *
 * But : **plus personne ne peut se connecter avec un mot de passe connu**. Le mot de passe par
 * défaut (`nrh2030`) circulait sur 7 250 comptes ; après ce seed, aucun mot de passe n'est
 * connu de qui que ce soit - pas même de l'administrateur, ni de ce seed, qui **ne conserve
 * nulle part** les valeurs en clair. La seule entrée devient le bouton « Recevoir mon mot de
 * passe par SMS » de l'écran de connexion.
 *
 * ── Pourquoi `must_change_password = 0` et non 1 ─────────────────────────────────────────
 * Les deux chemins de l'API ne se valent pas :
 *  - `must_change_password = 1` déclenche `handleFirstLogin` **pendant un login**, ce qui
 *    suppose de connaître le mot de passe courant pour arriver jusque-là. Avec un secret
 *    aléatoire, ce chemin devient inatteignable ;
 *  - le bouton « mot de passe oublié / 1re connexion » (`requestPasswordReset`) ne demande
 *    que le **numéro de téléphone** : il ne regarde ni le mot de passe courant ni le flag.
 * Mettre le flag à 0 laisse donc le bouton comme unique porte d'entrée - c'est exactement
 * l'objectif. (Vérifié dans `auth.service.ts` avant d'écrire ce seed.)
 *
 * ⚠️ **En développement, le verrouillage est sans effet.** `auth.service.validateUser` accepte
 * `nrh2030` pour TOUS les comptes quand `APP_ENV`/`NODE_ENV` vaut `development` - un passe-partout
 * volontaire, inerte en production. Sur une base locale ainsi configurée, la connexion par mot de
 * passe restera donc possible : ce n'est pas un échec du seed.
 *
 * Sauvegarde : les **anciens hachages** (jamais du clair) et l'ancien `must_change_password` sont
 * écrits dans `backups/` - c'est le seul moyen de revenir à l'état précédent.
 *
 * Exécution (depuis api/) :
 *   npm run seed:lock-passwords -- --dry-run
 *   npm run seed:lock-passwords -- --confirm
 */

/** Longueur du secret. 48 caractères base64url ≈ 288 bits : hors de portée d'une attaque. */
const LONGUEUR_SECRET = 48;

/** Coût bcrypt, aligné sur celui de l'entité `User` (`genSalt(10)`). */
const COUT_BCRYPT = 10;

/**
 * Hachages menés en parallèle. bcrypt libère la boucle d'événements et travaille sur le pool
 * libuv : sans lot, 7 886 hachages à ~65 ms s'enchaîneraient en série (plus de 8 minutes).
 */
const TAILLE_LOT = 16;

function horodatage(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

/**
 * Secret aléatoire cryptographique. `randomBytes` et non `Math.random` : ce dernier n'est pas
 * imprévisible, et un mot de passe devinable ferait échouer tout l'objectif.
 */
function genererSecret(): string {
  return crypto
    .randomBytes(LONGUEUR_SECRET)
    .toString('base64url')
    .slice(0, LONGUEUR_SECRET);
}

async function run(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const confirme = process.argv.includes('--confirm');
  const backup = !process.argv.includes('--no-backup');

  const ds: DataSource = await AppDataSource.initialize();
  console.log(`[mdp] Base cible : ${ds.options.database as string}`);

  try {
    const comptes: Array<{
      id: number;
      uuid: string;
      phone_number: string;
      password: string;
      must_change_password: number;
      is_active: number;
    }> = await ds.query(
      `SELECT id, uuid, phone_number, password, must_change_password, is_active
         FROM users ORDER BY id`,
    );

    const aChanger = comptes.filter((c) => c.must_change_password === 1).length;
    console.log(`[mdp] Comptes : ${comptes.length}`);
    console.log(`[mdp]   must_change_password = 1 : ${aChanger}`);
    console.log(`[mdp]   actifs                   : ${comptes.filter((c) => c.is_active === 1).length}`);
    console.log(
      `[mdp] Chaque compte recevra un secret aléatoire de ${LONGUEUR_SECRET} caractères, ` +
        `haché en bcrypt (coût ${COUT_BCRYPT}).`,
    );

    const envDev =
      (process.env.APP_ENV ?? '').toLowerCase() === 'development' ||
      (process.env.NODE_ENV ?? '').toLowerCase() === 'development';
    if (envDev) {
      console.log(
        "[mdp] ⚠️ APP_ENV/NODE_ENV = development : le passe-partout « nrh2030 » de " +
          'auth.service reste actif sur cette base. Le verrouillage ne sera réellement ' +
          'effectif qu’en production.',
      );
    }

    if (!confirme || dryRun) {
      console.log(
        `[mdp] ${dryRun ? '--dry-run' : 'Confirmation absente'} : aucune écriture. ` +
          'Relancer avec --confirm.',
      );
      return;
    }

    if (backup) {
      const backupDir = path.resolve(__dirname, '..', '..', 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const backupFile = path.join(backupDir, `mots-de-passe-${horodatage()}.json`);
      // Uniquement les HACHAGES précédents : aucun mot de passe en clair n'existe côté seed,
      // ni avant ni après. Ce fichier permet de revenir à l'état antérieur, rien de plus.
      fs.writeFileSync(
        backupFile,
        JSON.stringify(
          {
            comptes: comptes.map((c) => ({
              uuid: c.uuid,
              password_hash: c.password,
              must_change_password: c.must_change_password,
            })),
          },
          null,
          1,
        ),
        'utf8',
      );
      console.log(`[mdp] Sauvegarde des anciens hachages : ${backupFile}`);
    }

    const debut = Date.now();
    let traites = 0;

    for (let i = 0; i < comptes.length; i += TAILLE_LOT) {
      const lot = comptes.slice(i, i + TAILLE_LOT);

      // Le secret est généré, haché, puis **oublié** : il n'est ni retourné, ni journalisé,
      // ni écrit sur disque. Personne ne peut s'en servir pour se connecter.
      const hachages = await Promise.all(
        lot.map(async (compte) => ({
          uuid: compte.uuid,
          hash: await bcrypt.hash(genererSecret(), COUT_BCRYPT),
        })),
      );

      // Hors transaction, volontairement : une transaction de 7 886 UPDATE tiendrait des
      // minutes et bloquerait la table `users` (donc toute connexion) pendant ce temps.
      // L'opération est idempotente et la sauvegarde permet le retour arrière.
      for (const h of hachages) {
        await ds.query(
          'UPDATE users SET password = ?, must_change_password = 0 WHERE uuid = ?',
          [h.hash, h.uuid],
        );
      }

      traites += lot.length;
      if (traites % 800 < TAILLE_LOT || traites === comptes.length) {
        const ecoule = Math.round((Date.now() - debut) / 1000);
        console.log(`[mdp]   ${traites}/${comptes.length} comptes (${ecoule}s)`);
      }
    }

    console.log(
      `[mdp] ${traites} compte(s) verrouillé(s) en ${Math.round((Date.now() - debut) / 1000)}s.`,
    );
    console.log(
      '[mdp] Toutes les connexions passent désormais par « Recevoir mon mot de passe par SMS ».',
    );
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[mdp] Échec :', err);
  process.exit(1);
});
