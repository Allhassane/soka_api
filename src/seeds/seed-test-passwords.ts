import 'reflect-metadata';
import * as bcrypt from 'bcrypt';
import AppDataSource from '../data-source';
import { User } from '../users/entities/user.entity';

/**
 * SEED — Mot de passe partagé pour des comptes de test.
 *
 * Réutilise le DataSource de l'API (src/data-source.ts) : il charge le même
 * `.env`, donc il cible AUTOMATIQUEMENT la bonne base (DB_NAME, ex.
 * `soka_preprod_db`). Le mot de passe est haché avec le MÊME bcrypt que l'API.
 *
 * Exécution (depuis le dossier soka_api) :
 *   npm run seed:test-passwords
 *
 * Effets sur chaque compte ciblé :
 *   - password           = PASSWORD (haché bcrypt cost 10)
 *   - must_change_password = false  (sinon le login renvoie au flux SMS)
 *   - is_active          = true
 */

// -- Configuration (modifiable) ---------------------------------------------
const PASSWORD = 'LDJXYD01';
const PHONES = [
  '0151645214',
  '0707865465',
  '0707697733',
  '0749882079',
  '0778666182',
  '0505759519',
];
// Numéros à repasser en « utilisateur simple » (retire is_admin = admin global).
// 0151645214 (MONNET) est is_admin=1 en base → il contourne le périmètre et voit
// TOUS les districts. On le repasse en simple responsable pour qu'il ne voie que
// son district (Faya Ephrata). Videz ce tableau pour lui rendre son statut admin.
const DEMOTE_ADMINS: string[] = ['0151645214'];
// ---------------------------------------------------------------------------

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[seed] Base cible : ${ds.options.database as string}`);

  try {
    const hash = await bcrypt.hash(PASSWORD, 10);
    const repo = ds.getRepository(User);

    const res = await repo
      .createQueryBuilder()
      .update(User)
      .set({
        password: hash,
        must_change_password: false,
        is_active: true,
      })
      .where('phone_number IN (:...phones)', { phones: PHONES })
      .execute();

    console.log(
      `[seed] Comptes mis à jour : ${res.affected ?? 0} / ${PHONES.length}`,
    );

    if (DEMOTE_ADMINS.length) {
      const demote = await repo
        .createQueryBuilder()
        .update(User)
        .set({ is_admin: false })
        .where('phone_number IN (:...phones)', { phones: DEMOTE_ADMINS })
        .execute();
      console.log(
        `[seed] Comptes repassés en utilisateur simple : ${demote.affected ?? 0}`,
      );
    }

    // Récapitulatif (contrôle visuel)
    const rows = await repo
      .createQueryBuilder('u')
      .select([
        'u.phone_number AS phone_number',
        'u.firstname AS firstname',
        'u.lastname AS lastname',
        'u.is_admin AS is_admin',
        'u.is_active AS is_active',
        'u.must_change_password AS must_change_password',
      ])
      .where('u.phone_number IN (:...phones)', { phones: PHONES })
      .getRawMany();

    if (!rows.length) {
      console.warn(
        '[seed] ⚠ Aucun compte trouvé pour ces numéros dans cette base. ' +
          'Vérifiez DB_NAME dans .env et les numéros.',
      );
    } else {
      console.table(rows);
    }

    console.log(
      `[seed] Terminé. Connexion : téléphone + mot de passe « ${PASSWORD} ».`,
    );
  } finally {
    await ds.destroy();
  }
}

run().catch((err) => {
  console.error('[seed] Échec :', err);
  process.exit(1);
});
