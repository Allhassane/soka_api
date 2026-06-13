/**
 * ETL — Responsabilités & Niveaux (complément de la migration membres).
 *
 * 1) Seed `levels` depuis `soka_db_old.niveaux` (les 7 paliers).
 * 2) Crée le rôle « membre » (roles.id est char36 sans auto-increment => on fournit un uuid).
 * 3) Crée les `responsibilities` (dédupliquées par slug du type, niveau mappé, rôle membre).
 * 4) Crée les `member_responsibilities` (lien membre -> responsabilité, priorité 'high').
 *
 * Idempotent (skip existant). Lit l'ancienne base `soka_db_old`, écrit dans `soka_db`.
 * Usage : node scripts/migrate-responsibilities.js
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');

const uuid = () => crypto.randomUUID();
const slugify = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

const DB = { host: 'localhost', port: 3306, user: 'root', password: '' };
const NEW = process.env.DB_NAME || 'soka_db';
const OLD = process.env.OLD_DB_NAME || 'soka_db_old';

(async () => {
  const c = await mysql.createConnection({ ...DB, multipleStatements: true });
  const q = (s, p) => c.query(s, p).then((r) => r[0]);

  const su = await q(`SELECT uuid FROM \`${NEW}\`.users WHERE email = 'superadmin@soka.com' LIMIT 1`);
  const adminUuid = (su[0] && su[0].uuid) || uuid();

  // 1) Niveaux -> levels
  const lvCount = await q(`SELECT COUNT(*) n FROM \`${NEW}\`.levels`);
  if (lvCount[0].n === 0) {
    const niveaux = await q(`SELECT id, name, \`order\` o FROM \`${OLD}\`.niveaux`);
    for (const n of niveaux) {
      await q(
        `INSERT INTO \`${NEW}\`.levels (uuid, name, \`order\`, category, admin_uuid, created_at, updated_at)
         VALUES (?,?,?,?,?,NOW(6),NOW(6))`,
        [n.id, n.name, n.o, 'level', adminUuid],
      );
    }
    console.log('levels seedes: ' + niveaux.length);
  } else console.log('levels deja presents: ' + lvCount[0].n);

  const levels = await q(`SELECT uuid, name FROM \`${NEW}\`.levels`);
  const levelByName = {};
  for (const l of levels) levelByName[String(l.name).toUpperCase()] = l.uuid;
  const levelForNiveau = (nr) => {
    if (!nr) return null;
    let key = String(nr).toUpperCase();
    if (key === 'DIRECTION') key = 'NATIONAL';
    return levelByName[key] || null;
  };

  // 2) Rôle « membre »
  let role = (await q(`SELECT id, uuid FROM \`${NEW}\`.roles WHERE slug = 'membre' OR name = 'membre' LIMIT 1`))[0];
  let roleUuid;
  if (!role) {
    const rid = uuid();
    await q(
      `INSERT INTO \`${NEW}\`.roles (id, name, uuid, slug, created_at, updated_at) VALUES (?,?,?,?,NOW(6),NOW(6))`,
      [rid, 'membre', rid, 'membre'],
    );
    roleUuid = rid;
    console.log('role membre cree');
  } else {
    roleUuid = role.uuid || role.id;
    console.log('role membre existant');
  }

  // 3) Responsabilités (dédup par slug du type)
  const pairs = await q(
    `SELECT DISTINCT type_responsabilite t, niveau_responsabilite nr FROM \`${OLD}\`.membres
     WHERE type_responsabilite IS NOT NULL AND type_responsabilite <> ''`,
  );
  const respBySlug = {};
  for (const r of await q(`SELECT uuid, slug FROM \`${NEW}\`.responsibilities`)) respBySlug[r.slug] = r.uuid;
  let created = 0;
  for (const p of pairs) {
    const slug = slugify(p.t);
    if (respBySlug[slug]) continue;
    const ru = uuid();
    const gender = /femme/i.test(p.t) ? 'femme' : /homme/i.test(p.t) ? 'homme' : 'mixte';
    await q(
      `INSERT INTO \`${NEW}\`.responsibilities
       (uuid, name, slug, admin_uuid, status, gender, level_uuid, role_uuid, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,NOW(6),NOW(6))`,
      [ru, p.t, slug, adminUuid, 'enable', gender, levelForNiveau(p.nr), roleUuid],
    );
    respBySlug[slug] = ru;
    created++;
  }
  console.log('responsabilites creees: ' + created + ' (total: ' + Object.keys(respBySlug).length + ')');

  // 4) member_responsibilities
  const responsibles = await q(
    `SELECT id, type_responsabilite t FROM \`${OLD}\`.membres
     WHERE type_responsabilite IS NOT NULL AND type_responsabilite <> ''`,
  );
  const mrSet = new Set(
    (await q(`SELECT member_uuid, responsibility_uuid FROM \`${NEW}\`.member_responsibilities`))
      .map((x) => x.member_uuid + '|' + x.responsibility_uuid),
  );
  let mrCreated = 0, skipped = 0;
  for (const m of responsibles) {
    const ru = respBySlug[slugify(m.t)];
    if (!ru) { skipped++; continue; }
    const k = m.id + '|' + ru;
    if (mrSet.has(k)) continue;
    await q(
      `INSERT INTO \`${NEW}\`.member_responsibilities (uuid, member_uuid, responsibility_uuid, priority, created_at, updated_at)
       VALUES (?,?,?,?,NOW(6),NOW(6))`,
      [uuid(), m.id, ru, 'high'],
    );
    mrSet.add(k);
    mrCreated++;
  }
  console.log('member_responsibilities creees: ' + mrCreated + ' (ignorees: ' + skipped + ')');

  await c.end();
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
