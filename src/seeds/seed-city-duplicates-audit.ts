import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import AppDataSource from '../data-source';
import { MemberEntity } from '../members/entities/member.entity';
import { CityEntity } from '../cities/entities/city.entity';
import { JournalZoneCityEntity } from '../journals/entities/journal-zone-city.entity';

/**
 * AUDIT - Doublons du référentiel des villes (LECTURE SEULE).
 *
 * But : vérifier concrètement pourquoi une même ville (ex. « OSAKA ») apparaît
 * plusieurs fois dans les menus. On regroupe les `cities` par NOM NORMALISÉ
 * (trim + espaces compactés + minuscules) et on affiche, pour chaque groupe de
 * doublons, les UUID DISTINCTS, le nom exact, le nombre de membres rattachés et
 * si la ligne est desservie (rattachée à au moins une zone).
 *
 * -> Si les UUID d'un même nom sont différents, ce sont bien des lignes
 *    distinctes en base (vrais doublons), pas un bug d'affichage.
 *
 * N'écrit RIEN en base. Exporte un CSV : soka_api/city-duplicates.csv
 *
 * Exécution (depuis soka_api) :
 *   npm run seed:city-duplicates-audit
 */

function normalize(name: string): string {
  return (name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[audit] Base cible : ${ds.options.database as string}`);

  try {
    const memberRepo = ds.getRepository(MemberEntity);
    const cityRepo = ds.getRepository(CityEntity);
    const zoneCityRepo = ds.getRepository(JournalZoneCityEntity);

    // Villes actives (find() exclut les soft-deleted).
    const cities = await cityRepo.find();

    // Membres par ville.
    const members = await memberRepo.find({
      select: ['uuid', 'city_uuid'] as (keyof MemberEntity)[],
    });
    const membersByCity = new Map<string, number>();
    for (const m of members) {
      const cu = (m as unknown as { city_uuid: string | null }).city_uuid;
      if (!cu) continue;
      membersByCity.set(cu, (membersByCity.get(cu) ?? 0) + 1);
    }

    // Villes desservies (rattachées à une zone).
    const links = await zoneCityRepo.find();
    const servedCitySet = new Set(links.map((l) => l.city_uuid));

    // Regroupement par nom normalisé.
    type Row = { uuid: string; name: string; members: number; served: boolean };
    const groups = new Map<string, Row[]>();
    for (const c of cities) {
      const key = normalize(c.name);
      const row: Row = {
        uuid: c.uuid,
        name: c.name,
        members: membersByCity.get(c.uuid) ?? 0,
        served: servedCitySet.has(c.uuid),
      };
      const arr = groups.get(key);
      if (arr) arr.push(row);
      else groups.set(key, [row]);
    }

    // Groupes en doublon (plus d'une ligne pour le même nom normalisé).
    const dupGroups = Array.from(groups.entries())
      .map(([key, rows]) => ({
        key,
        rows,
        redundant: rows.length - 1,
        members: rows.reduce((s, r) => s + r.members, 0),
        served: rows.filter((r) => r.served).length,
      }))
      .filter((g) => g.rows.length > 1)
      // Tri : d'abord ceux qui ont le plus de membres, puis le plus de lignes.
      .sort((a, b) => b.members - a.members || b.rows.length - a.rows.length);

    const totalRedundant = dupGroups.reduce((s, g) => s + g.redundant, 0);
    const membersInDupGroups = dupGroups.reduce((s, g) => s + g.members, 0);

    // ---- Rapport ----
    console.log('\n========== AUDIT DOUBLONS VILLES ==========');
    console.log(`Villes actives              : ${cities.length}`);
    console.log(`Noms distincts (normalisés) : ${groups.size}`);
    console.log(`Groupes en doublon          : ${dupGroups.length}`);
    console.log(`Lignes redondantes          : ${totalRedundant}  (à fusionner/supprimer)`);
    console.log(`Membres dans ces groupes    : ${membersInDupGroups}`);
    console.log('-------------------------------------------');

    if (dupGroups.length === 0) {
      console.log('Aucun doublon détecté. 🎉');
    } else {
      console.log('\nTOP groupes de doublons (nom → lignes distinctes) :\n');
      dupGroups.slice(0, 20).forEach((g, i) => {
        const label = g.rows[0].name;
        console.log(
          `${String(i + 1).padStart(2)}. « ${label} »  -  ${g.rows.length} lignes | ${g.members} membres | ${g.served} desservie(s)`,
        );
        g.rows
          .slice()
          .sort((a, b) => b.members - a.members)
          .forEach((r) => {
            const tag = r.served ? '  [desservie]' : '';
            console.log(
              `      • ${r.uuid}  "${r.name}"  →  ${r.members} membres${tag}`,
            );
          });
      });
      if (dupGroups.length > 20) {
        console.log(`\n… +${dupGroups.length - 20} autres groupes (voir CSV).`);
      }
    }

    // ---- Export CSV ----
    const BOM = String.fromCharCode(0xfeff);
    const header = 'nom_normalise;uuid;nom_exact;membres;desservie';
    const rows: string[] = [];
    for (const g of dupGroups) {
      for (const r of g.rows) {
        rows.push(
          `"${g.key.replace(/"/g, '""')}";${r.uuid};"${r.name.replace(/"/g, '""')}";${r.members};${r.served ? 'oui' : 'non'}`,
        );
      }
    }
    const csvPath = path.resolve(__dirname, '../../city-duplicates.csv');
    fs.writeFileSync(csvPath, BOM + [header, ...rows].join('\n'), 'utf8');
    console.log(`\n[audit] Détail exporté -> ${csvPath}`);
    console.log('[audit] (lecture seule - aucune écriture en base)');
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((e) => {
  console.error('[audit] Échec :', e);
  process.exit(1);
});
