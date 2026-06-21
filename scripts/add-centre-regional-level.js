/**
 * Insère le niveau « CENTRE_REGIONAL » entre REGION (order 1) et CENTRE.
 *
 * Stratégie (validée) :
 *  - décaler les `order` >= 2 de +1 (la pyramide passe à 8 niveaux, 0→7) ;
 *  - créer 1 « Centre Régional {Région} » par défaut PAR région (3) ;
 *  - re-parenter les 54 Centres : parent_uuid Région → Centre Régional de leur région ;
 *  - reconstruire structure_closure (CTE récursive, comme AddHierarchyIntegrity).
 *
 * Non destructif, idempotent (s'arrête si le niveau existe déjà), avec snapshot de rollback.
 * Les admins pourront ensuite créer d'autres Centres Régionaux et renommer ceux par défaut.
 */
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const uuid = () => crypto.randomUUID();

const LEVEL_NAME = 'CENTRE_REGIONAL';
const TARGET_ORDER = 2;

(async () => {
  const c = await mysql.createConnection({
    host: 'localhost', port: 3306, user: 'root', password: '', database: process.env.DB_NAME || 'soka_db',
  });
  const q = (s, p) => c.query(s, p).then((r) => r[0]);

  // 0) Idempotence
  const already = await q('SELECT uuid, `order` FROM levels WHERE name = ?', [LEVEL_NAME]);
  if (already.length) {
    console.log('⏭  Niveau ' + LEVEL_NAME + ' déjà présent (order ' + already[0].order + '). Aucune action.');
    await c.end();
    return;
  }

  const regionLvl = (await q("SELECT uuid FROM levels WHERE name='REGION'"))[0];
  const centreLvl = (await q("SELECT uuid FROM levels WHERE name='CENTRE'"))[0];
  if (!regionLvl || !centreLvl) throw new Error('Niveau REGION ou CENTRE introuvable');

  // 1) Snapshot rollback AVANT toute modification
  const regions = await q(
    "SELECT s.uuid, s.name FROM structures s JOIN levels l ON l.uuid=s.level_uuid WHERE l.name='REGION' AND s.deleted_at IS NULL",
  );
  const centres = await q(
    "SELECT s.uuid, s.parent_uuid FROM structures s JOIN levels l ON l.uuid=s.level_uuid WHERE l.name='CENTRE' AND s.deleted_at IS NULL",
  );
  const snapshot = {
    note: 'Rollback de add-centre-regional-level. Pour annuler : remettre parent_uuid des centres, supprimer les CR créés, retirer le niveau, décaler les orders -1, reconstruire la closure.',
    centres_old_parent: centres.map((x) => ({ centre_uuid: x.uuid, old_parent_uuid: x.parent_uuid })),
    created: { level_uuid: null, level_name: LEVEL_NAME, centre_regionaux: [] },
  };

  // 2) Décaler les orders >= 2 (+1), du plus grand au plus petit (sûr même sans index unique)
  await q('UPDATE levels SET `order` = `order` + 1 WHERE category = ? AND `order` >= ? ORDER BY `order` DESC', ['level', TARGET_ORDER]);
  console.log('✓ Orders décalés : CENTRE..SOUS_GROUPE +1');

  // 3) Créer le niveau CENTRE_REGIONAL à l'order 2
  const adminUuid = (await q('SELECT admin_uuid FROM levels WHERE admin_uuid IS NOT NULL LIMIT 1'))[0]?.admin_uuid || null;
  const crLvlUuid = uuid();
  await q(
    'INSERT INTO levels (uuid, name, `order`, category, admin_uuid, created_at, updated_at) VALUES (?,?,?,?,?,NOW(6),NOW(6))',
    [crLvlUuid, LEVEL_NAME, TARGET_ORDER, 'level', adminUuid],
  );
  snapshot.created.level_uuid = crLvlUuid;
  console.log('✓ Niveau ' + LEVEL_NAME + ' créé (order ' + TARGET_ORDER + ')');

  // 4) Un Centre Régional par défaut par région + re-parentage des centres
  let totalReparent = 0;
  for (const region of regions) {
    const crUuid = uuid();
    const crName = 'Centre Régional ' + region.name;
    await q(
      'INSERT INTO structures (id, uuid, name, parent_id, parent_uuid, level_uuid, level_id, admin_uuid, created_at, updated_at) ' +
        'VALUES (?,?,?,?,?,?,?,?,NOW(6),NOW(6))',
      [crUuid, crUuid, crName, region.uuid, region.uuid, crLvlUuid, null, null],
    );
    const res = await q(
      'UPDATE structures SET parent_uuid = ?, parent_id = ? WHERE parent_uuid = ? AND level_uuid = ? AND deleted_at IS NULL',
      [crUuid, crUuid, region.uuid, centreLvl.uuid],
    );
    totalReparent += res.affectedRows;
    snapshot.created.centre_regionaux.push({ uuid: crUuid, name: crName, region_uuid: region.uuid, centres_rattaches: res.affectedRows });
    console.log('  • ' + region.name + ' → "' + crName + '" (+' + res.affectedRows + ' centres)');
  }
  console.log('✓ ' + totalReparent + ' centres re-parentés sous leur Centre Régional');

  // Écrire le snapshot
  const snapPath = path.resolve(__dirname, 'rollback-centre-regional.json');
  fs.writeFileSync(snapPath, JSON.stringify(snapshot, null, 2));
  console.log('✓ Snapshot rollback : ' + snapPath);

  // 5) Reconstruire la closure (CTE récursive, identique à AddHierarchyIntegrity)
  await q('DELETE FROM structure_closure');
  await q(
    'INSERT INTO structure_closure (ancestor_uuid, descendant_uuid, depth) ' +
      'WITH RECURSIVE tree AS (' +
      '  SELECT uuid AS ancestor, uuid AS descendant, 0 AS depth FROM structures WHERE deleted_at IS NULL AND uuid IS NOT NULL ' +
      '  UNION ALL ' +
      '  SELECT t.ancestor, s.uuid, t.depth + 1 FROM tree t JOIN structures s ON s.parent_uuid = t.descendant AND s.deleted_at IS NULL' +
      ') SELECT ancestor, descendant, depth FROM tree',
  );
  const closureCount = (await q('SELECT COUNT(*) n FROM structure_closure'))[0].n;
  console.log('✓ Closure reconstruite : ' + closureCount + ' lignes');

  // 6) Vérifications
  console.log('\n===== VÉRIFICATIONS =====');
  const lvls = await q("SELECT name, `order` AS o FROM levels WHERE category='level' ORDER BY `order`");
  console.log('Niveaux (' + lvls.length + ') : ' + lvls.map((l) => l.o + ':' + l.name).join('  '));
  const maxDepth = (await q('SELECT MAX(depth) d FROM structure_closure'))[0].d;
  console.log('Profondeur max closure : ' + maxDepth + ' (attendu 7)');
  const crStats = await q(
    'SELECT s.name, (SELECT COUNT(*) FROM structures c WHERE c.parent_uuid=s.uuid AND c.deleted_at IS NULL) nb_enfants ' +
      'FROM structures s WHERE s.level_uuid=? AND s.deleted_at IS NULL ORDER BY s.name',
    [crLvlUuid],
  );
  for (const cr of crStats) console.log('  CR "' + cr.name + '" : ' + cr.nb_enfants + ' centres');
  const orphanCentres = (await q(
    'SELECT COUNT(*) n FROM structures s WHERE s.level_uuid=? AND s.deleted_at IS NULL AND s.parent_uuid IN (SELECT uuid FROM structures WHERE level_uuid=?)',
    [centreLvl.uuid, regionLvl.uuid],
  ))[0].n;
  console.log('Centres encore directement sous une Région (attendu 0) : ' + orphanCentres);

  await c.end();
  console.log('\n✅ Terminé.');
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
