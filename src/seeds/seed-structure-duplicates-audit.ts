import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import AppDataSource from '../data-source';
import { StructureEntity } from '../structure/entities/structure.entity';
import { LevelEntity } from '../level/entities/level.entity';
import { MemberEntity } from '../members/entities/member.entity';

/**
 * AUDIT — Doublons du référentiel des STRUCTURES (LECTURE SEULE).
 *
 * Pourquoi ce seed : dans le formulaire de zone, le menu « Région » fusionne
 * structures + villes. Or « OSAKA » n'est PAS dans la table `cities` : les
 * occurrences répétées viennent de la table `structures` (recherche par nom).
 * Le menu n'affiche que le NOM (pas le niveau), donc plusieurs structures
 * nommées « OSAKA » à des NIVEAUX différents (Région, Centre, District…)
 * paraissent identiques.
 *
 * Ce seed regroupe les structures par nom normalisé et montre, pour chaque
 * groupe, les UUID DISTINCTS + le NIVEAU + le PARENT + le nb de membres. Il
 * distingue :
 *   - « multi-niveaux » : même nom mais niveaux différents → LÉGITIME
 *     (il faut désambiguïser l'affichage par le niveau, pas fusionner).
 *   - « même niveau »   : vrais doublons potentiels → à examiner / nettoyer.
 *
 * N'écrit RIEN en base. Exporte : soka_api/structure-duplicates.csv
 *
 * Exécution (depuis soka_api) :
 *   npm run seed:structure-duplicates-audit
 */

function normalize(name: string): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[audit] Base cible : ${ds.options.database as string}`);

  try {
    const structureRepo = ds.getRepository(StructureEntity);
    const levelRepo = ds.getRepository(LevelEntity);
    const memberRepo = ds.getRepository(MemberEntity);

    const structures = await structureRepo.find();
    const levels = await levelRepo.find();
    const levelName = new Map(levels.map((l) => [l.uuid, l.name]));

    // Nom de structure par uuid (pour afficher le parent).
    const nameByUuid = new Map(structures.map((s) => [s.uuid, s.name]));

    // Nb de membres par structure.
    const members = await memberRepo.find({
      select: ['uuid', 'structure_uuid'] as (keyof MemberEntity)[],
    });
    const membersByStruct = new Map<string, number>();
    for (const m of members) {
      const su = (m as unknown as { structure_uuid: string | null }).structure_uuid;
      if (!su) continue;
      membersByStruct.set(su, (membersByStruct.get(su) ?? 0) + 1);
    }

    type Row = {
      uuid: string;
      name: string;
      level_uuid: string | null;
      level: string;
      parent: string;
      members: number;
    };
    const groups = new Map<string, Row[]>();
    for (const s of structures) {
      const key = normalize(s.name);
      const lu = (s.level_uuid as string | undefined) ?? null;
      const pu = (s.parent_uuid as string | undefined) ?? null;
      const row: Row = {
        uuid: s.uuid,
        name: s.name,
        level_uuid: lu,
        level: lu ? (levelName.get(lu) ?? 'Inconnu') : '—',
        parent: pu ? (nameByUuid.get(pu) ?? '—') : '(racine)',
        members: membersByStruct.get(s.uuid) ?? 0,
      };
      const arr = groups.get(key);
      if (arr) arr.push(row);
      else groups.set(key, [row]);
    }

    const dupGroups = Array.from(groups.entries())
      .map(([key, rows]) => {
        const distinctLevels = new Set(rows.map((r) => r.level_uuid ?? 'none'));
        return {
          key,
          rows,
          multiLevel: distinctLevels.size > 1,
          members: rows.reduce((s, r) => s + r.members, 0),
        };
      })
      .filter((g) => g.rows.length > 1)
      .sort((a, b) => b.rows.length - a.rows.length || b.members - a.members);

    const multi = dupGroups.filter((g) => g.multiLevel);
    const same = dupGroups.filter((g) => !g.multiLevel);

    console.log('\n========== AUDIT DOUBLONS STRUCTURES ==========');
    console.log(`Structures                    : ${structures.length}`);
    console.log(`Noms distincts (normalisés)   : ${groups.size}`);
    console.log(`Groupes de même nom (>1)      : ${dupGroups.length}`);
    console.log(`  • multi-niveaux (légitime)  : ${multi.length}`);
    console.log(`  • même niveau (à examiner)  : ${same.length}`);
    console.log('-----------------------------------------------');

    const printGroup = (g: (typeof dupGroups)[number], i: number) => {
      const tag = g.multiLevel ? 'multi-niveaux' : 'MÊME NIVEAU';
      console.log(
        `${String(i + 1).padStart(2)}. « ${g.rows[0].name} »  —  ${g.rows.length} structures [${tag}] | ${g.members} membres`,
      );
      g.rows
        .slice()
        .sort((a, b) => b.members - a.members)
        .forEach((r) => {
          console.log(
            `      • ${r.uuid}  niveau=${r.level.padEnd(16)} parent=${r.parent.padEnd(18)} ${r.members} membres`,
          );
        });
    };

    if (dupGroups.length === 0) {
      console.log('Aucun nom de structure en double. 🎉');
    } else {
      console.log('\nTOP groupes (nom → structures distinctes) :\n');
      dupGroups.slice(0, 20).forEach(printGroup);
      if (dupGroups.length > 20)
        console.log(`\n… +${dupGroups.length - 20} autres groupes (voir CSV).`);
    }

    // ---- CSV ----
    const BOM = String.fromCharCode(0xfeff);
    const header = 'nom_normalise;uuid;nom_exact;niveau;parent;membres;type_groupe';
    const rows: string[] = [];
    for (const g of dupGroups) {
      const type = g.multiLevel ? 'multi-niveaux' : 'meme-niveau';
      for (const r of g.rows) {
        rows.push(
          `"${g.key.replace(/"/g, '""')}";${r.uuid};"${r.name.replace(/"/g, '""')}";"${r.level}";"${r.parent.replace(/"/g, '""')}";${r.members};${type}`,
        );
      }
    }
    const csvPath = path.resolve(__dirname, '../../structure-duplicates.csv');
    fs.writeFileSync(csvPath, BOM + [header, ...rows].join('\n'), 'utf8');
    console.log(`\n[audit] Détail exporté -> ${csvPath}`);
    console.log('[audit] (lecture seule — aucune écriture en base)');
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((e) => {
  console.error('[audit] Échec :', e);
  process.exit(1);
});
