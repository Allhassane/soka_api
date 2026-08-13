/**
 * Export JSON de l'arbre des structures (NATIONAL → … → palier choisi).
 *
 * Produit un document **imbriqué** : chaque nœud porte son nom, son uuid, le
 * nombre d'enfants et le tableau de ses enfants du palier suivant. C'est la forme
 * attendue par les écrans et les exports « organigramme », par opposition à un
 * SELECT à plat où il faut reconstruire la filiation à la main.
 *
 * Lecture seule - aucune écriture en base.
 *
 * La base ciblée suit `DB_NAME` : le script charge `../.env` s'il existe (même
 * mécanisme que `src/data-source.ts`), donc il vise AUTOMATIQUEMENT la base
 * réellement utilisée par l'API. Aucun nom de base en dur.
 *
 * Usage :
 *   node scripts/export-structures-tree.js
 *   node scripts/export-structures-tree.js --out=../structures-hierarchie.json
 *   node scripts/export-structures-tree.js --jusqu-a=DISTRICT
 *   node scripts/export-structures-tree.js --jusqu-a=SOUS_GROUPE --out=arbre-complet.json
 *
 * ⚠️ Descendre sous CENTRE grossit vite le fichier (129 chapitres, 336 districts,
 * 1 095 groupes, 2 104 sous-groupes au 2026-08-05).
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

// --- .env (chargé sans dépendance dotenv, cf. src/data-source.ts) -------------
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'soka_app',
  charset: 'utf8mb4',
};

// Ordre officiel des paliers (mêmes noms qu'en base, cf. buildBreadcrumb).
const HIERARCHIE = [
  'NATIONAL',
  'REGION',
  'CENTRE_REGIONAL',
  'CENTRE',
  'CHAPITRE',
  'DISTRICT',
  'GROUPE',
  'SOUS_GROUPE',
];

// Nom de la collection d'enfants pour chaque palier, dans le JSON produit.
const CLE_ENFANTS = {
  NATIONAL: 'regions',
  REGION: 'centres_regionaux',
  CENTRE_REGIONAL: 'centres',
  CENTRE: 'chapitres',
  CHAPITRE: 'districts',
  DISTRICT: 'groupes',
  GROUPE: 'sous_groupes',
};

const arg = (nom, defaut) => {
  const trouve = process.argv.find((a) => a.startsWith(`--${nom}=`));
  return trouve ? trouve.slice(nom.length + 3) : defaut;
};

const JUSQU_A = arg('jusqu-a', 'CENTRE').toUpperCase();
const SORTIE = path.resolve(
  __dirname,
  '..',
  arg('out', '../structures-hierarchie.json'),
);

const profondeur = HIERARCHIE.indexOf(JUSQU_A);
if (profondeur < 1) {
  console.error(
    `Palier inconnu : "${JUSQU_A}". Valeurs acceptées : ${HIERARCHIE.slice(1).join(', ')}.`,
  );
  process.exit(1);
}
const NIVEAUX = HIERARCHIE.slice(0, profondeur + 1);

const parNom = (a, b) => a.nom.localeCompare(b.nom, 'fr');

(async () => {
  const cx = await mysql.createConnection(DB);

  // Un seul SELECT : l'arbre est reconstruit en mémoire (quelques milliers de lignes).
  const [rows] = await cx.query(
    `SELECT s.uuid, s.name AS nom, s.parent_uuid, l.name AS niveau
       FROM structures s
       LEFT JOIN levels l ON l.uuid = s.level_uuid
      WHERE s.deleted_at IS NULL
        AND l.name IN (?)`,
    [NIVEAUX],
  );
  await cx.end();

  // Index parent → enfants, pour éviter un balayage par nœud.
  const parParent = new Map();
  for (const r of rows) {
    const k = r.parent_uuid || '';
    if (!parParent.has(k)) parParent.set(k, []);
    parParent.get(k).push(r);
  }

  const compteurs = {};
  NIVEAUX.forEach((n) => (compteurs[n] = 0));

  /** Construit récursivement un nœud et ses descendants jusqu'à JUSQU_A. */
  const construire = (row) => {
    compteurs[row.niveau] += 1;
    const noeud = { nom: row.nom, uuid: row.uuid };
    const rang = HIERARCHIE.indexOf(row.niveau);
    const niveauEnfant = HIERARCHIE[rang + 1];

    if (rang < profondeur && niveauEnfant) {
      const enfants = (parParent.get(row.uuid) || [])
        .filter((e) => e.niveau === niveauEnfant)
        .map(construire)
        .sort(parNom);
      noeud[`nombre_de_${CLE_ENFANTS[row.niveau]}`] = enfants.length;
      noeud[CLE_ENFANTS[row.niveau]] = enfants;
    }
    return noeud;
  };

  const racine = rows.find((r) => r.niveau === 'NATIONAL');
  if (!racine) {
    console.error(`Aucune structure de niveau NATIONAL dans ${DB.database}.`);
    process.exit(1);
  }

  const doc = {
    _description:
      `Arbre des structures SOKA, du NATIONAL jusqu'au niveau ${JUSQU_A}. ` +
      'Chaque nœud porte son nom, son uuid et ses enfants du palier suivant.',
    _source: `${DB.database}.structures (lignes non supprimées) × ${DB.database}.levels`,
    _genere_le: new Date().toISOString().slice(0, 10),
    _regenerer: 'npm run export:structures',
    hierarchie_des_niveaux: HIERARCHIE,
    profondeur_exportee: NIVEAUX.join(' > '),
    // `compteurs` est passé par référence puis rempli par `construire` ci-dessous :
    // il est complet au moment de la sérialisation.
    totaux: compteurs,
    national: construire(racine),
  };

  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, JSON.stringify(doc, null, 2) + '\n', 'utf8');

  console.log(`Base : ${DB.database} - écrit : ${SORTIE}`);
  console.log(
    '  ' +
      NIVEAUX.map((n) => `${compteurs[n]} ${n.toLowerCase()}`).join(' · '),
  );

  // Contrôle d'intégrité : une structure du périmètre non rattachée à l'arbre
  // n'apparaîtrait nulle part dans le fichier sans que rien ne le signale.
  const attendus = rows.length;
  const exportes = NIVEAUX.reduce((n, k) => n + compteurs[k], 0);
  if (exportes !== attendus) {
    console.warn(
      `  ⚠️ ${attendus - exportes} structure(s) hors arbre (parent absent, supprimé ` +
        `ou d'un palier inattendu) : présentes en base mais ABSENTES du fichier.`,
    );
  }
})();
