/**
 * Analyse d'impact : insérer un niveau « Centre Régional » entre Région et Centre.
 * Lecture seule. N'effectue AUCUNE modification.
 */
const mysql = require('mysql2/promise');

const pad = (s, n) => String(s ?? '').padEnd(n);
const padL = (s, n) => String(s ?? '').padStart(n);

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: process.env.DB_NAME || 'soka_app',
  });
  const q = (s, p) => c.query(s, p).then((r) => r[0]);

  console.log('\n========== 1. NIVEAUX ACTUELS (levels) ==========');
  const levels = await q(
    "SELECT l.uuid, l.name, l.`order` AS ord, l.category, " +
    "(SELECT COUNT(*) FROM structures s WHERE s.level_uuid=l.uuid AND s.deleted_at IS NULL) AS nb_struct, " +
    "(SELECT COUNT(*) FROM responsibilities r WHERE r.level_uuid=l.uuid AND r.deleted_at IS NULL) AS nb_resp " +
    'FROM levels l ORDER BY l.`order`',
  );
  console.log(pad('order', 7) + pad('name', 22) + pad('category', 14) + padL('structures', 12) + padL('responsabilites', 18));
  for (const l of levels) {
    console.log(padL(l.ord, 5) + '  ' + pad(l.name, 22) + pad(l.category || '-', 14) + padL(l.nb_struct, 12) + padL(l.nb_resp, 18));
  }
  const orders = levels.map((l) => Number(l.ord));
  const contigu = orders.every((o, i) => i === 0 || o === orders[i - 1] + 1);
  console.log('-> orders: [' + orders.join(', ') + '] ' + (contigu ? 'CONTIGUS (insertion = renumérotation +1 en dessous)' : 'NON contigus (gaps disponibles)'));

  // Repérer Région et Centre
  const find = (re) => levels.find((l) => re.test((l.name || '').toLowerCase()));
  const region = find(/r[ée]gion/);
  const centre = levels.find((l) => /centre/.test((l.name || '').toLowerCase()) && !/r[ée]gional/.test((l.name || '').toLowerCase()));
  console.log('\n-> Région = ' + (region ? `"${region.name}" (order ${region.ord})` : 'INTROUVABLE'));
  console.log('-> Centre = ' + (centre ? `"${centre.name}" (order ${centre.ord})` : 'INTROUVABLE'));
  if (region && centre) {
    console.log('-> adjacents ? ' + (Number(centre.ord) === Number(region.ord) + 1 ? 'OUI (Région+1 = Centre)' : `NON (écart ${Number(centre.ord) - Number(region.ord)})`));
  }

  console.log('\n========== 2. CHAÎNE PARENT DES STRUCTURES "CENTRE" ==========');
  if (centre) {
    const parentLevels = await q(
      "SELECT pl.name AS parent_level, pl.`order` AS parent_order, COUNT(*) AS nb " +
      'FROM structures s ' +
      'JOIN structures p ON p.uuid = s.parent_uuid ' +
      'LEFT JOIN levels pl ON pl.uuid = p.level_uuid ' +
      'WHERE s.level_uuid = ? AND s.deleted_at IS NULL ' +
      'GROUP BY pl.uuid ORDER BY nb DESC',
      [centre.uuid],
    );
    console.log('Parents directs des structures de niveau Centre (qui deviendraient enfants de "Centre Régional") :');
    for (const r of parentLevels) console.log('  ' + padL(r.nb, 6) + ' Centre(s) ont pour parent un niveau "' + (r.parent_level || 'NULL/inconnu') + '" (order ' + (r.parent_order ?? '?') + ')');
    const orphans = await q('SELECT COUNT(*) n FROM structures s WHERE s.level_uuid=? AND s.deleted_at IS NULL AND (s.parent_uuid IS NULL OR s.parent_uuid="")', [centre.uuid]);
    console.log('  Centres SANS parent : ' + orphans[0].n);
  }

  console.log('\n========== 3. SOUS-ARBRE IMPACTÉ (Centre et en dessous, via closure) ==========');
  // colonnes de la closure
  const cc = await q("SHOW COLUMNS FROM structure_closure");
  console.log('Colonnes structure_closure : ' + cc.map((x) => x.Field).join(', '));
  if (centre) {
    // descendants distincts des structures Centre (inclut Centre lui-meme)
    try {
      const sub = await q(
        'SELECT COUNT(DISTINCT cl.descendant_uuid) AS n ' +
        'FROM structure_closure cl ' +
        'JOIN structures s ON s.uuid = cl.ancestor_uuid ' +
        'WHERE s.level_uuid = ? AND s.deleted_at IS NULL',
        [centre.uuid],
      );
      console.log('Structures dans le sous-arbre Centre (Centre + tout en dessous) : ' + sub[0].n);
    } catch (e) { console.log('(closure descendant/ancestor : ' + e.message + ')'); }
  }
  const totalStruct = await q('SELECT COUNT(*) n FROM structures WHERE deleted_at IS NULL');
  const totalClosure = await q('SELECT COUNT(*) n FROM structure_closure');
  console.log('TOTAL structures actives : ' + totalStruct[0].n + ' | lignes closure : ' + totalClosure[0].n);

  console.log('\n========== 4. MEMBRES & UTILISATEURS PAR NIVEAU ==========');
  const membersByLevel = await q(
    "SELECT l.name, l.`order` AS ord, COUNT(m.uuid) AS nb_membres, " +
    'COUNT(DISTINCT u.uuid) AS nb_users ' +
    'FROM levels l ' +
    'LEFT JOIN structures s ON s.level_uuid = l.uuid AND s.deleted_at IS NULL ' +
    'LEFT JOIN members m ON m.structure_uuid = s.uuid AND m.deleted_at IS NULL ' +
    'LEFT JOIN users u ON u.member_uuid = m.uuid ' +
    'GROUP BY l.uuid ORDER BY l.`order`',
  );
  console.log(pad('order', 7) + pad('name', 22) + padL('membres', 12) + padL('users liés', 14));
  for (const r of membersByLevel) console.log(padL(r.ord, 5) + '  ' + pad(r.name, 22) + padL(r.nb_membres, 12) + padL(r.nb_users, 14));

  console.log('\n========== 5. RESPONSABLES IMPACTÉS (member_responsibilities par niveau) ==========');
  const respByLevel = await q(
    "SELECT l.name, l.`order` AS ord, COUNT(mr.uuid) AS nb_liens " +
    'FROM member_responsibilities mr ' +
    'JOIN responsibilities r ON r.uuid = mr.responsibility_uuid ' +
    'JOIN levels l ON l.uuid = r.level_uuid ' +
    'WHERE mr.deleted_at IS NULL ' +
    'GROUP BY l.uuid ORDER BY l.`order`',
  );
  for (const r of respByLevel) console.log('  ' + pad(r.name, 22) + ' order ' + padL(r.ord, 3) + ' : ' + r.nb_liens + ' responsable(s)');
  console.log('-> Un responsable au niveau RÉGION verra le nouveau palier "Centre Régional" entrer dans son périmètre (scoping par closure).');
  console.log('-> Un responsable au niveau CENTRE garde le même périmètre, mais sa chaîne d\'ancêtres s\'allonge de 1.');

  await c.end();
  console.log('\n========== FIN ANALYSE (lecture seule, 0 modification) ==========\n');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
