/**
 * Seed `user_roles` - attribue à chaque compte utilisateur son rôle dérivé des données.
 *
 * Règle (validée 2026-07-25), UNE seule ligne par utilisateur, par précédence :
 *   1. `users.is_admin = 1`                      -> ADMINISTRATEUR
 *   2. sinon ≥1 ligne vivante dans
 *      `member_responsibilities` pour son membre  -> RESPONSABLE
 *   3. sinon                                      -> MEMBRE
 *
 * ⚠ POURQUOI UNE SEULE LIGNE : `auth.service.ts:195` lit `roles[0]` et `findUserRoles`
 * (`user.service.ts:256`) n'a AUCUN `ORDER BY`. Deux lignes pour un même utilisateur = rôle
 * retenu indéterminé (l'admin, qui porte aussi une responsabilité, pourrait hériter des 14
 * permissions de RESPONSABLE au lieu de ses 43).
 *
 * ⚠ `user_roles` est indexée sur les UTILISATEURS, pas sur les membres : le pont est
 * `users.member_uuid -> members.uuid` (sans FK). Un membre sans compte ne peut donc PAS avoir
 * de ligne (273 membres dans ce cas au 2026-07-25) - c'est attendu, pas une anomalie.
 *
 * ⚠ EFFET DE BORD À CONNAÎTRE : remplir cette table désactive le repli
 * `permissionsSource='responsibility_role'` (`auth.service.ts:194-201`). Sans régression ici :
 * les 31 responsabilités pointent TOUTES vers RESPONSABLE, donc les responsables gardent le
 * même jeu de permissions. Seul l'admin change : 14 -> 43 permissions actives dans
 * `global_permissions`. Les permissions étant gelées dans le JWT au login, l'effet n'apparaît
 * qu'après RECONNEXION.
 *
 * ⚠ `user_id` / `role_id` laissés à NULL, volontairement :
 *   - `roles.id` est un CHAR(36) hérité (= l'uuid), pas un entier : `role_id INT` ne peut pas
 *     le porter. Le lien réel passe par les colonnes `*_uuid`, comme le fait `findUserRoles`.
 *   - Surtout, `permission.service.ts:180` joint `ur.role_id = rp.role_id` alors que
 *     `roles_permissions.role_id` vaut **0 sur toutes les lignes** : écrire `role_id = 0` ici
 *     ferait matcher TOUTES les permissions de TOUS les rôles pour chaque utilisateur
 *     (fuite de droits). NULL ne matche jamais -> on préserve le comportement actuel.
 *
 * Note collations : `user_roles.*_uuid` est en `latin1_general_ci` alors que `users.uuid` /
 * `roles.uuid` / `members.uuid` sont en `utf8mb4_unicode_ci`. Les jointures implicites
 * fonctionnent (MySQL convertit latin1 -> utf8mb4) ; c'est appliquer un `COLLATE utf8mb4_*`
 * explicite SUR une colonne latin1 qui échoue. Vérifié sur la requête de login réelle.
 *
 * Idempotent : rejouable. Aucune contrainte unique sur (user_uuid, role_uuid) en base -> la
 * convergence est assurée en code (corrige le rôle, réactive, dédoublonne).
 *
 * Usage :
 *   node scripts/seed-user-roles.js              # simulation (par défaut, AUCUNE écriture)
 *   node scripts/seed-user-roles.js --apply      # applique dans une transaction
 *   node scripts/seed-user-roles.js --apply --verbose
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');
const CHUNK = 500;

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'soka_db',
};

const SLUG_ADMIN = 'administrateur';
const SLUG_RESP = 'responsable';
const SLUG_MEMBRE = 'membre';

const uuid = () => crypto.randomUUID();
const n = (x) => Number(x).toLocaleString('fr-FR');

(async () => {
  const c = await mysql.createConnection(DB);
  const q = (s, p) => c.query(s, p).then((r) => r[0]);

  console.log(`base : ${DB.database}@${DB.host}:${DB.port}`);
  console.log(APPLY ? 'mode : APPLY (écriture)' : 'mode : SIMULATION (--apply pour écrire)');

  // ── 1) Les 3 rôles cibles doivent exister (sinon : jouer setup-3-roles.js d'abord)
  const roles = await q('SELECT uuid, name, slug FROM roles WHERE deleted_at IS NULL');
  const bySlug = new Map(roles.map((r) => [r.slug, r]));
  const manquants = [SLUG_ADMIN, SLUG_RESP, SLUG_MEMBRE].filter((s) => !bySlug.has(s));
  if (manquants.length) {
    console.error(`ABORT : rôle(s) absent(s) en base : ${manquants.join(', ')}`);
    console.error('  -> jouer d\'abord : node scripts/setup-3-roles.js');
    process.exit(1);
  }
  const roleUuid = {
    [SLUG_ADMIN]: bySlug.get(SLUG_ADMIN).uuid,
    [SLUG_RESP]: bySlug.get(SLUG_RESP).uuid,
    [SLUG_MEMBRE]: bySlug.get(SLUG_MEMBRE).uuid,
  };
  const slugParUuid = new Map(Object.entries(roleUuid).map(([s, u]) => [u, s]));
  console.log(`rôles résolus : ${Object.entries(roleUuid).map(([s, u]) => `${s}=${u.slice(0, 8)}…`).join('  ')}`);

  // ── 2) Population cible + rôle dérivé
  //    Comptes vivants rattachés à un membre vivant ; un admin sans membre est conservé
  //    (le flag is_admin le rend administrateur indépendamment de sa fiche membre).
  const cibles = await q(`
    SELECT u.uuid                 AS user_uuid,
           u.phone_number         AS phone_number,
           u.is_admin             AS is_admin,
           (m.uuid IS NOT NULL)   AS a_membre,
           EXISTS (SELECT 1 FROM member_responsibilities mr
                    WHERE mr.deleted_at IS NULL
                      AND mr.member_uuid = u.member_uuid) AS est_responsable
      FROM users u
      LEFT JOIN members m
             ON m.uuid = u.member_uuid
            AND m.deleted_at IS NULL
     WHERE u.deleted_at IS NULL
       AND (m.uuid IS NOT NULL OR u.is_admin = 1)
     ORDER BY u.id
  `);

  const slugCible = (r) => {
    if (Number(r.is_admin) === 1) return SLUG_ADMIN;
    if (Number(r.est_responsable) === 1) return SLUG_RESP;
    return SLUG_MEMBRE;
  };
  const cibleParUser = new Map(cibles.map((r) => [r.user_uuid, slugCible(r)]));

  // Contexte informatif (non bloquant) : ce que le seeder ne peut pas couvrir.
  const ctx = (await q(`
    SELECT (SELECT COUNT(*) FROM members WHERE deleted_at IS NULL) AS membres_vivants,
           (SELECT COUNT(*) FROM members m WHERE m.deleted_at IS NULL AND NOT EXISTS
              (SELECT 1 FROM users u WHERE u.deleted_at IS NULL AND u.member_uuid = m.uuid)) AS membres_sans_compte,
           (SELECT COUNT(*) FROM users WHERE deleted_at IS NULL) AS users_vivants,
           (SELECT COUNT(*) FROM users u WHERE u.deleted_at IS NULL AND NOT EXISTS
              (SELECT 1 FROM members m WHERE m.deleted_at IS NULL AND m.uuid = u.member_uuid)
              AND u.is_admin <> 1) AS users_sans_membre_ignores
  `))[0];

  // ── 3) État existant (toutes les lignes, y compris soft-deleted : on les recycle)
  const existantes = await q(
    'SELECT id, uuid, user_uuid, role_uuid, is_active, deleted_at FROM user_roles ORDER BY id',
  );
  const parUser = new Map();
  for (const l of existantes) {
    if (!parUser.has(l.user_uuid)) parUser.set(l.user_uuid, []);
    parUser.get(l.user_uuid).push(l);
  }

  // ── 4) Plan : créations / corrections / suppressions
  const aCreer = [];              // { user_uuid, slug }
  const aCorriger = [];           // { id, slug, avant }
  const aSupprimer = [];          // ids (doublons + lignes hors population)
  let inchangees = 0;
  const parRole = { [SLUG_ADMIN]: 0, [SLUG_RESP]: 0, [SLUG_MEMBRE]: 0 };

  for (const [user_uuid, slug] of cibleParUser) {
    parRole[slug]++;
    const cible = roleUuid[slug];
    const lignes = parUser.get(user_uuid) || [];

    if (lignes.length === 0) {
      aCreer.push({ user_uuid, slug });
      continue;
    }
    // On garde en priorité une ligne déjà sur le bon rôle, sinon la plus ancienne.
    const garder = lignes.find((l) => l.role_uuid === cible && !l.deleted_at)
      || lignes.find((l) => l.role_uuid === cible)
      || lignes[0];

    const conforme = garder.role_uuid === cible && Number(garder.is_active) === 1 && !garder.deleted_at;
    if (conforme) inchangees++;
    else {
      aCorriger.push({
        id: garder.id,
        slug,
        avant: garder.deleted_at
          ? 'supprimée'
          : Number(garder.is_active) !== 1
            ? 'inactive'
            : (slugParUuid.get(garder.role_uuid) || 'rôle inconnu'),
      });
    }
    for (const l of lignes) if (l.id !== garder.id) aSupprimer.push(l.id);
  }

  // Lignes rattachées à un utilisateur hors population (compte supprimé, member_uuid orphelin…)
  const horsPopulation = existantes.filter((l) => !cibleParUser.has(l.user_uuid));
  for (const l of horsPopulation) aSupprimer.push(l.id);

  // ── 5) Rapport
  const parRoleCorrections = (arr) => {
    const acc = {};
    for (const x of arr) acc[x.slug] = (acc[x.slug] || 0) + 1;
    return Object.entries(acc).map(([s, v]) => `${s}=${n(v)}`).join(' · ') || '-';
  };

  console.log('\n========== CONTEXTE ==========');
  console.log(`membres vivants                     : ${n(ctx.membres_vivants)}`);
  console.log(`  dont SANS compte utilisateur      : ${n(ctx.membres_sans_compte)}  (aucune ligne possible)`);
  console.log(`comptes utilisateurs vivants        : ${n(ctx.users_vivants)}`);
  console.log(`  ignorés (aucun membre, non admin) : ${n(ctx.users_sans_membre_ignores)}`);
  console.log(`lignes user_roles déjà en base      : ${n(existantes.length)}`);

  console.log('\n========== PLAN ==========');
  console.log(`population cible (1 ligne/compte) : ${n(cibles.length)}`);
  console.log(`  ADMINISTRATEUR : ${n(parRole[SLUG_ADMIN])}`);
  console.log(`  RESPONSABLE    : ${n(parRole[SLUG_RESP])}`);
  console.log(`  MEMBRE         : ${n(parRole[SLUG_MEMBRE])}`);
  console.log(`à créer      : ${n(aCreer.length)}  (${parRoleCorrections(aCreer)})`);
  console.log(`à corriger   : ${n(aCorriger.length)}  (${parRoleCorrections(aCorriger)})`);
  console.log(`inchangées   : ${n(inchangees)}`);
  console.log(`à supprimer  : ${n(aSupprimer.length)}  (dont ${n(horsPopulation.length)} hors population)`);

  if (VERBOSE) {
    for (const x of aCorriger.slice(0, 20)) console.log(`  corrige #${x.id} : ${x.avant} -> ${x.slug}`);
    if (aCorriger.length > 20) console.log(`  … +${n(aCorriger.length - 20)}`);
  }

  const rien = !aCreer.length && !aCorriger.length && !aSupprimer.length;
  if (rien) {
    console.log('\n✅ Rien à faire : la base est déjà conforme.');
    await c.end();
    return;
  }
  if (!APPLY) {
    console.log('\nSIMULATION - aucune écriture. Relancer avec --apply pour appliquer.');
    await c.end();
    return;
  }

  // ── 6) Écriture (transaction unique)
  await c.beginTransaction();
  try {
    let insertees = 0;
    for (let i = 0; i < aCreer.length; i += CHUNK) {
      const lot = aCreer.slice(i, i + CHUNK);
      const params = [];
      for (const x of lot) params.push(uuid(), x.user_uuid, roleUuid[x.slug]);
      // user_id / role_id volontairement absents -> NULL (voir en-tête).
      await q(
        'INSERT INTO user_roles (uuid, user_uuid, role_uuid, is_active, created_at, updated_at) VALUES '
          + lot.map(() => '(?,?,?,1,NOW(6),NOW(6))').join(','),
        params,
      );
      insertees += lot.length;
    }

    // Corrections groupées par rôle cible (réactive et « dé-supprime » la ligne conservée).
    let corrigees = 0;
    for (const slug of [SLUG_ADMIN, SLUG_RESP, SLUG_MEMBRE]) {
      const ids = aCorriger.filter((x) => x.slug === slug).map((x) => x.id);
      for (let i = 0; i < ids.length; i += CHUNK) {
        const lot = ids.slice(i, i + CHUNK);
        const r = await q(
          'UPDATE user_roles SET role_uuid=?, is_active=1, deleted_at=NULL, updated_at=NOW(6) WHERE id IN (?)',
          [roleUuid[slug], lot],
        );
        corrigees += r.affectedRows ?? 0;
      }
    }

    let supprimees = 0;
    for (let i = 0; i < aSupprimer.length; i += CHUNK) {
      const lot = aSupprimer.slice(i, i + CHUNK);
      const r = await q('DELETE FROM user_roles WHERE id IN (?)', [lot]);
      supprimees += r.affectedRows ?? 0;
    }

    await c.commit();
    console.log(`\nécrit : ${n(insertees)} créée(s) · ${n(corrigees)} corrigée(s) · ${n(supprimees)} supprimée(s)`);
  } catch (e) {
    await c.rollback();
    console.error('\n❌ ROLLBACK - aucune écriture conservée : ' + e.message);
    process.exit(1);
  }

  // ── 7) Vérification post-écriture
  const total = (await q('SELECT COUNT(*) v FROM user_roles'))[0].v;
  const repartition = await q(`
    SELECT r.name AS role, COUNT(*) AS nb
      FROM user_roles ur JOIN roles r ON r.uuid = ur.role_uuid
     WHERE ur.deleted_at IS NULL AND ur.is_active = 1
     GROUP BY r.name ORDER BY r.name`);
  const anomalies = (await q(`
    SELECT
      (SELECT COUNT(*) FROM (SELECT user_uuid FROM user_roles WHERE deleted_at IS NULL
         GROUP BY user_uuid HAVING COUNT(*) > 1) d)                            AS users_multi_roles,
      (SELECT COUNT(*) FROM user_roles ur WHERE NOT EXISTS
         (SELECT 1 FROM roles r WHERE r.uuid = ur.role_uuid))                  AS role_uuid_orphelin,
      (SELECT COUNT(*) FROM user_roles ur WHERE NOT EXISTS
         (SELECT 1 FROM users u WHERE u.uuid = ur.user_uuid AND u.deleted_at IS NULL)) AS user_uuid_orphelin,
      (SELECT COUNT(*) FROM user_roles WHERE uuid IS NULL OR uuid = '')         AS uuid_vide,
      (SELECT COUNT(*) FROM user_roles WHERE is_active <> 1)                    AS inactives
  `))[0];

  // La requête de login réelle (findUserRoles) doit renvoyer exactement 1 rôle par échantillon.
  const echantillons = await q(`
    SELECT r.slug AS attendu, u.uuid AS user_uuid, u.phone_number
      FROM user_roles ur
      JOIN users u ON u.uuid = ur.user_uuid
      JOIN roles r ON r.uuid = ur.role_uuid
     WHERE ur.deleted_at IS NULL
     GROUP BY r.slug, u.uuid, u.phone_number`);
  const parSlug = {};
  for (const e of echantillons) if (!parSlug[e.attendu]) parSlug[e.attendu] = e;

  console.log('\n========== VÉRIFICATION ==========');
  console.log(`lignes user_roles : ${n(total)}`);
  console.log('répartition active :', JSON.stringify(repartition.map((r) => `${r.role}=${n(r.nb)}`)));
  console.log('anomalies :', JSON.stringify(anomalies));

  let loginOk = true;
  for (const [slug, e] of Object.entries(parSlug)) {
    // Réplique exacte de user.service.ts::findUserRoles
    const r = await q(`
      SELECT DISTINCT role.uuid AS role_uuid, role.name AS role_name, role.slug AS role_slug
        FROM user_roles ur
        INNER JOIN roles role ON role.uuid = ur.role_uuid
       WHERE ur.user_uuid = ? AND ur.is_active = 1`, [e.user_uuid]);
    const ok = r.length === 1 && r[0].role_slug === slug;
    if (!ok) loginOk = false;
    console.log(`  login ${e.phone_number} (${slug}) -> ${r.length} rôle(s) : ${JSON.stringify(r.map((x) => x.role_slug))} ${ok ? '✓' : '✗'}`);
  }

  const ok = Number(anomalies.users_multi_roles) === 0
    && Number(anomalies.role_uuid_orphelin) === 0
    && Number(anomalies.user_uuid_orphelin) === 0
    && Number(anomalies.uuid_vide) === 0
    && Number(anomalies.inactives) === 0
    && Number(total) === cibles.length
    && loginOk;
  console.log(ok ? '\n✅ OK' : '\n❌ INCOHÉRENCE - vérifier ci-dessus');
  console.log('⚠ Les permissions sont gelées dans le JWT : effet visible après RECONNEXION.');

  await c.end();
  if (!ok) process.exit(1);
})().catch((e) => { console.error('FATAL', e.code || '', e.message); process.exit(1); });
