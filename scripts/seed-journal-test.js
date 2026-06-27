/**
 * Seed de TEST du workflow journal (zone-centric).
 *  - clôture une campagne d'abonnement (statut 'completed') ;
 *  - rattache 5 membres à la ville « YOPOUGON TOIT ROUGE » (=> ZONE 1) ;
 *  - crée 1 paiement payé (status 'success', quantité 1) par membre.
 *
 * Usage (depuis soka_api) :
 *   node scripts/seed-journal-test.js
 *   node scripts/seed-journal-test.js "Journal du bonheur"   // autre campagne
 *
 * Idempotent : nettoie ses propres paiements (actor_name='SEED-TEST') avant de réinsérer.
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const uuid = () => crypto.randomUUID();

// Charge .env manuellement (comme src/data-source.ts)
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const SUB_NAME = process.argv[2] || 'SERMENT DU BONHEUR';
const CITY_NAME = 'YOPOUGON TOIT ROUGE';
const N = 5;

(async () => {
  const c = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'soka_preprod_db',
  });
  const q = (s, p) => c.query(s, p).then((r) => r[0]);

  // 1) Campagne -> completed
  const subs = await q('SELECT uuid FROM subscriptions WHERE name = ? LIMIT 1', [
    SUB_NAME,
  ]);
  if (!subs.length) {
    console.error(`✗ Abonnement introuvable : "${SUB_NAME}"`);
    await c.end();
    process.exit(1);
  }
  const subUuid = subs[0].uuid;
  await q("UPDATE subscriptions SET status = 'completed' WHERE uuid = ?", [
    subUuid,
  ]);
  console.log(`✓ Campagne "${SUB_NAME}" clôturée (completed).`);

  // 2) Ville de rattachement -> ZONE 1
  const cities = await q('SELECT uuid FROM cities WHERE name = ? LIMIT 1', [
    CITY_NAME,
  ]);
  const cityUuid = cities.length ? cities[0].uuid : null;
  if (!cityUuid) {
    console.warn(`⚠ Ville "${CITY_NAME}" introuvable — rattachement zone ignoré.`);
  }

  // 3) 5 membres
  const members = await q(
    'SELECT uuid, firstname, lastname FROM members ORDER BY id LIMIT 5',
  );
  if (cityUuid) {
    for (const m of members) {
      await q('UPDATE members SET city_uuid = ? WHERE uuid = ?', [
        cityUuid,
        m.uuid,
      ]);
    }
    console.log(`✓ ${members.length} membres rattachés à "${CITY_NAME}".`);
  }

  // 4) Paiements payés (1 par membre)
  await q("DELETE FROM subscription_payments WHERE actor_name = 'SEED-TEST'");
  for (const m of members) {
    const name = `${m.lastname || ''} ${m.firstname || ''}`.trim();
    await q(
      `INSERT INTO subscription_payments
        (uuid, amount, quantity, subscription_uuid, beneficiary_uuid, beneficiary_name,
         actor_uuid, actor_name, payment_uuid, status, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
      [uuid(), 100, 1, subUuid, m.uuid, name, m.uuid, 'SEED-TEST', uuid(), 'success'],
    );
  }
  console.log(`✓ ${members.length} paiements payés (success) créés.`);

  // 5) Récap
  const cnt = await q(
    "SELECT COUNT(*) n FROM subscription_payments WHERE subscription_uuid = ? AND status = 'success'",
    [subUuid],
  );
  const st = await q('SELECT status FROM subscriptions WHERE uuid = ?', [subUuid]);
  console.log(
    `→ Statut campagne : ${st[0].status} · Paiements payés : ${cnt[0].n}`,
  );
  console.log(
    'OK. Crée maintenant une édition liée à cette campagne, puis onglet « Besoin (abonnements) ».',
  );
  await c.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
