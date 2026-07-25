import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { In } from 'typeorm';
import AppDataSource from '../data-source';
import { MemberEntity } from '../members/entities/member.entity';
import { CityEntity } from '../cities/entities/city.entity';
import { JournalZoneCityEntity } from '../journals/entities/journal-zone-city.entity';
import { JournalZoneEntity } from '../journals/entities/journal-zone.entity';
import { StructureEntity } from '../structure/entities/structure.entity';

/**
 * AUDIT — Couverture des membres par une zone desservie (LECTURE SEULE).
 *
 * Objectif : s'assurer que chaque membre est rattaché à une zone de
 * distribution. Le lien est : members.city_uuid -> journal_zone_cities.city_uuid
 * -> journal_zones. Un membre est « desservi » si sa ville est rattachée à au
 * moins une zone (active). Sinon il est « non desservi ».
 *
 * Comme toutes les zones ne sont pas encore créées, la liste des villes « avec
 * des membres mais sans zone » constitue la WORKLIST : les villes qu'il reste à
 * rattacher à une zone (ou pour lesquelles créer une zone).
 *
 * Ce script n'écrit RIEN en base. Il affiche un rapport et exporte un CSV
 * (worklist) dans soka_api/zone-coverage-worklist.csv.
 *
 * NB : find() exclut automatiquement les lignes soft-deleted (deleted_at). Les
 * villes désactivées (soft-delete) n'apparaissent donc plus comme desservies ;
 * leurs membres ressortent dans « ville désactivée / introuvable ».
 *
 * Exécution (depuis soka_api) :
 *   npm run seed:zone-coverage-audit
 */

function pct(n: number, d: number): string {
  return d > 0 ? ((n / d) * 100).toFixed(1) + '%' : '—';
}

function trunc(s: string, n: number): string {
  const v = s ?? '';
  return v.length > n ? v.slice(0, n - 1) + '…' : v;
}

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[audit] Base cible : ${ds.options.database as string}`);

  try {
    const memberRepo = ds.getRepository(MemberEntity);
    const cityRepo = ds.getRepository(CityEntity);
    const zoneCityRepo = ds.getRepository(JournalZoneCityEntity);
    const zoneRepo = ds.getRepository(JournalZoneEntity);
    const structureRepo = ds.getRepository(StructureEntity);

    // 1. Villes desservies = villes rattachées à au moins une zone (liens actifs).
    const links = await zoneCityRepo.find();
    const servedCitySet = new Set(links.map((l) => l.city_uuid));

    // 1bis. Villes rattachées à PLUSIEURS zones (ambiguïté type « Abidjan » :
    //   une ville couvre plusieurs quartiers/districts → le rattachement par
    //   ville seule est arbitraire et fausse le décompte).
    const cityZones = new Map<string, Set<string>>();
    for (const l of links) {
      const s = cityZones.get(l.city_uuid) ?? new Set<string>();
      s.add(l.zone_uuid);
      cityZones.set(l.city_uuid, s);
    }
    const multiZoneCitySet = new Set(
      Array.from(cityZones.entries())
        .filter(([, z]) => z.size > 1)
        .map(([c]) => c),
    );

    // 2. Référentiel des villes actives (non soft-deleted).
    const cities = await cityRepo.find();
    const cityMap = new Map(cities.map((c) => [c.uuid, c]));

    // 3. Zones créées (non soft-deleted).
    const zones = await zoneRepo.find();

    // 3bis. SIMULATION « structure + sous-arbre » (n'est PAS le modèle du journal).
    //   Une zone est configurée avec une structure (« Région »). Ici on considère
    //   qu'elle couvrirait tous les membres dont la structure = celle de la zone
    //   OU l'une de ses descendantes (sous-arbre via parent_uuid).
    //   NB : certaines zones ont une « Région » qui est en fait une VILLE (créée à
    //   la volée) ; on ne retient que les structure_uuid qui sont de vraies structures.
    const structures = await structureRepo.find({
      select: ['uuid', 'parent_uuid'] as (keyof StructureEntity)[],
    });
    const validStructSet = new Set(structures.map((s) => s.uuid));
    const childrenMap = new Map<string, string[]>();
    for (const s of structures) {
      const p = (s as unknown as { parent_uuid: string | null }).parent_uuid;
      if (p) {
        const arr = childrenMap.get(p) ?? [];
        arr.push(s.uuid);
        childrenMap.set(p, arr);
      }
    }
    const zoneStructRoots = Array.from(
      new Set(
        zones
          .map((z) => (z as unknown as { structure_uuid: string | null }).structure_uuid)
          .filter((u): u is string => !!u && validStructSet.has(u)),
      ),
    );
    // Union des sous-arbres (parcours en profondeur).
    const coveredStructSet = new Set<string>();
    const stack = [...zoneStructRoots];
    while (stack.length) {
      const u = stack.pop() as string;
      if (coveredStructSet.has(u)) continue;
      coveredStructSet.add(u);
      const kids = childrenMap.get(u);
      if (kids) for (const k of kids) if (!coveredStructSet.has(k)) stack.push(k);
    }
    const zonesWithStruct = zones.filter(
      (z) => {
        const su = (z as unknown as { structure_uuid: string | null }).structure_uuid;
        return !!su && validStructSet.has(su);
      },
    ).length;

    // Attribution PAR ZONE (modèle structure) : chaque structure racine de zone
    // pointe vers sa zone ; un membre est attribué à la zone dont la racine est
    // l'ancêtre le PLUS PROCHE de sa structure (remontée via parent_uuid).
    const parentMap = new Map<string, string | null>();
    for (const s of structures) {
      parentMap.set(
        s.uuid,
        (s as unknown as { parent_uuid: string | null }).parent_uuid ?? null,
      );
    }
    const rootToZone = new Map<string, JournalZoneEntity>();
    for (const z of zones) {
      const su = (z as unknown as { structure_uuid: string | null }).structure_uuid;
      if (su && validStructSet.has(su) && !rootToZone.has(su)) rootToZone.set(su, z);
    }
    const zoneForStructMemo = new Map<string, string | null>();
    const zoneForStruct = (su: string | null): string | null => {
      if (!su) return null;
      if (zoneForStructMemo.has(su)) return zoneForStructMemo.get(su) ?? null;
      const path: string[] = [];
      let cur: string | null = su;
      let found: string | null = null;
      const guard = new Set<string>();
      while (cur && !guard.has(cur)) {
        guard.add(cur);
        path.push(cur);
        const z = rootToZone.get(cur);
        if (z) {
          found = z.uuid;
          break;
        }
        cur = parentMap.get(cur) ?? null;
      }
      for (const p of path) if (!zoneForStructMemo.has(p)) zoneForStructMemo.set(p, found);
      return found;
    };

    // 4. Membres (non soft-deleted). On inclut les champs d'identité pour
    //    détecter d'éventuels doublons de PERSONNES (mêmes gens enregistrés
    //    plusieurs fois → gonflent le décompte quel que soit le modèle).
    const members = await memberRepo.find({
      select: [
        'uuid',
        'city_uuid',
        'structure_uuid',
        'matricule',
        'firstname',
        'lastname',
        'birth_date',
        'phone',
      ] as (keyof MemberEntity)[],
    });

    let served = 0; // ville rattachée à une zone (modèle actuel du journal)
    let noCity = 0; // aucune ville renseignée
    let unservedExists = 0; // ville existe mais aucune zone
    let unservedMissing = 0; // ville désactivée / introuvable

    // Simulation « structure + sous-arbre » et combinaison ville OU structure.
    let servedStruct = 0; // structure du membre ∈ un sous-arbre de zone
    let servedEither = 0; // desservi par la ville OU par la structure
    let gainStructOnly = 0; // rattrapés UNIQUEMENT par la structure (pas la ville)
    let remainingNon = 0; // ni ville ni structure
    let noStruct = 0; // aucune structure renseignée
    let membersMultiZoneCity = 0; // membre dont la ville est rattachée à >1 zone

    // Regroupement des non-desservis (par ville) pour la worklist.
    const perCity = new Map<string, { name: string; count: number; kind: string }>();

    for (const m of members) {
      const cu = (m as unknown as { city_uuid: string | null }).city_uuid;
      const su = (m as unknown as { structure_uuid: string | null }).structure_uuid;

      if (cu && multiZoneCitySet.has(cu)) membersMultiZoneCity++;

      // --- Couverture par VILLE (modèle actuel du journal) ---
      let byCity = false;
      if (!cu) {
        noCity++;
      } else if (servedCitySet.has(cu)) {
        byCity = true;
        served++;
      } else {
        const city = cityMap.get(cu);
        if (city) {
          unservedExists++;
          const e = perCity.get(cu) ?? { name: city.name, count: 0, kind: 'ville_sans_zone' };
          e.count++;
          perCity.set(cu, e);
        } else {
          unservedMissing++;
          const e =
            perCity.get(cu) ?? { name: '(ville désactivée / introuvable)', count: 0, kind: 'ville_desactivee' };
          e.count++;
          perCity.set(cu, e);
        }
      }

      // --- Couverture par STRUCTURE + sous-arbre (SIMULATION) ---
      const byStruct = !!su && coveredStructSet.has(su);
      if (!su) noStruct++;
      if (byStruct) servedStruct++;
      if (byCity || byStruct) servedEither++;
      if (byStruct && !byCity) gainStructOnly++;
      if (!byCity && !byStruct) remainingNon++;
    }

    const total = members.length;
    const unservedTotal = noCity + unservedExists + unservedMissing;

    // Répartition PAR ZONE selon le modèle structure + sous-arbre.
    const perZoneStruct = new Map<string, number>();
    let nonRattachesStruct = 0;
    for (const m of members) {
      const su = (m as unknown as { structure_uuid: string | null }).structure_uuid;
      const zu = zoneForStruct(su);
      if (zu) perZoneStruct.set(zu, (perZoneStruct.get(zu) ?? 0) + 1);
      else nonRattachesStruct++;
    }

    // Enrichissement pour la table : nom de la région (structure racine),
    // responsable (nom), nombre de villes par zone.
    const rootNameMap = new Map<string, string>();
    if (zoneStructRoots.length) {
      const rootStructs = await structureRepo.find({
        where: { uuid: In(zoneStructRoots) },
        select: ['uuid', 'name'] as (keyof StructureEntity)[],
      });
      for (const s of rootStructs) rootNameMap.set(s.uuid, s.name);
    }
    const respUuids = Array.from(
      new Set(
        zones
          .map((z) => (z as unknown as { responsible_member_uuid: string | null }).responsible_member_uuid)
          .filter((u): u is string => !!u),
      ),
    );
    const respNameMap = new Map<string, string>();
    if (respUuids.length) {
      const resp = await memberRepo.find({
        where: { uuid: In(respUuids) },
        select: ['uuid', 'firstname', 'lastname'] as (keyof MemberEntity)[],
      });
      for (const r of resp) {
        const nm = `${(r as unknown as { lastname?: string }).lastname ?? ''} ${(r as unknown as { firstname?: string }).firstname ?? ''}`.trim();
        respNameMap.set(r.uuid, nm);
      }
    }
    const cityCountByZone = new Map<string, number>();
    for (const l of links) {
      cityCountByZone.set(l.zone_uuid, (cityCountByZone.get(l.zone_uuid) ?? 0) + 1);
    }

    // Lignes de la table (zones ayant une structure et au moins un abonné).
    const zoneStructRows = zones
      .map((z) => {
        const su = (z as unknown as { structure_uuid: string | null }).structure_uuid;
        const ru = (z as unknown as { responsible_member_uuid: string | null }).responsible_member_uuid;
        return {
          number: (z as unknown as { number: number | null }).number ?? 0,
          zone: (z as unknown as { name: string | null }).name ?? '',
          region: su ? (rootNameMap.get(su) ?? '—') : '—',
          responsable: ru ? (respNameMap.get(ru) ?? '—') : '—',
          villes: cityCountByZone.get(z.uuid) ?? 0,
          abonnes: perZoneStruct.get(z.uuid) ?? 0,
          hasStruct: !!su && validStructSet.has(su),
        };
      })
      .filter((r) => r.hasStruct && r.abonnes > 0)
      .sort((a, b) => a.number - b.number);

    const zonesStructZero = zones.filter((z) => {
      const su = (z as unknown as { structure_uuid: string | null }).structure_uuid;
      return !!su && validStructSet.has(su) && (perZoneStruct.get(z.uuid) ?? 0) === 0;
    }).length;

    // ---- Cohérence anti-duplication ----
    // Chaque membre n'est compté qu'une fois : on itère la liste DISTINCTE des
    // membres et on l'attribue à AU PLUS une zone (ville : 1 city → 1 zone ;
    // structure : racine ancêtre la plus proche). On le prouve par réconciliation.
    const distinctMembers = new Set(members.map((m) => m.uuid)).size;
    const cityReconc = served + noCity + unservedExists + unservedMissing === total;
    const structSum = Array.from(perZoneStruct.values()).reduce((a, b) => a + b, 0);
    const structReconc = structSum + nonRattachesStruct === total;

    // Doublons de PERSONNES (mêmes gens enregistrés plusieurs fois → gonflent le
    // décompte quel que soit le modèle). Détectés par téléphone, matricule, et
    // nom+prénom+date de naissance.
    const normTxt = (s?: string | null) =>
      (s ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
    const normPhone = (p?: string | null) => (p ?? '').replace(/\D/g, '');
    const dupBy = (keyFn: (m: MemberEntity) => string | null) => {
      const g = new Map<string, string[]>();
      for (const m of members) {
        const k = keyFn(m);
        if (!k) continue;
        const arr = g.get(k) ?? [];
        arr.push(m.uuid);
        g.set(k, arr);
      }
      const groups = Array.from(g.entries()).filter(([, v]) => v.length > 1);
      const extra = groups.reduce((s, [, v]) => s + v.length - 1, 0);
      return { groups, groupCount: groups.length, extra };
    };
    const dupPhone = dupBy((m) => {
      const p = normPhone((m as unknown as { phone?: string }).phone);
      return p.length >= 6 ? p : null;
    });
    const dupMatricule = dupBy((m) => {
      const x = normTxt((m as unknown as { matricule?: string }).matricule);
      return x || null;
    });
    const dupNameBirth = dupBy((m) => {
      const ln = normTxt((m as unknown as { lastname?: string }).lastname);
      const fn = normTxt((m as unknown as { firstname?: string }).firstname);
      if (!ln || !fn) return null;
      const bd = (m as unknown as { birth_date?: Date | string | null }).birth_date;
      const b = bd ? new Date(bd).toISOString().slice(0, 10) : '';
      return `${ln}|${fn}|${b}`;
    });

    // Worklist triée par nombre de membres décroissant.
    const worklist = Array.from(perCity.entries())
      .map(([uuid, v]) => ({ city_uuid: uuid, name: v.name, members: v.count, kind: v.kind }))
      .sort((a, b) => b.members - a.members);

    // Villes actives non rattachées à une zone (indépendamment des membres).
    const citiesUnserved = cities.filter((c) => !servedCitySet.has(c.uuid));

    // ---- Rapport ----
    console.log('\n========== AUDIT COUVERTURE ZONES ==========');
    console.log(`Zones créées               : ${zones.length}`);
    console.log(
      `Villes actives             : ${cities.length}  (desservies: ${
        cities.length - citiesUnserved.length
      } | sans zone: ${citiesUnserved.length})`,
    );
    console.log(`Membres (non supprimés)    : ${total}`);
    console.log('--------------------------------------------');
    console.log(`✅ Desservis               : ${served}  (${pct(served, total)})`);
    console.log(`⚠️  Non desservis           : ${unservedTotal}  (${pct(unservedTotal, total)})`);
    console.log(`   • sans ville renseignée : ${noCity}`);
    console.log(`   • ville sans zone       : ${unservedExists}`);
    console.log(`   • ville désactivée      : ${unservedMissing}`);
    console.log('--------------------------------------------');

    // ---- SIMULATION : couverture par structure + sous-arbre ----
    console.log('\n===== SIMULATION : STRUCTURE + SOUS-ARBRE (hors journal) =====');
    console.log(`Zones avec structure configurée : ${zonesWithStruct} / ${zones.length}`);
    console.log(`  racines distinctes            : ${zoneStructRoots.length}`);
    console.log(`Structures couvertes (racines + descendants) : ${coveredStructSet.size}`);
    console.log(`Membres sans structure          : ${noStruct}`);
    console.log('--------------------------------------------');
    console.log(`Desservis par VILLE (modèle actuel)   : ${served}  (${pct(served, total)})`);
    console.log(`Desservis par STRUCTURE (sous-arbre)  : ${servedStruct}  (${pct(servedStruct, total)})`);
    console.log(`Desservis par VILLE ou STRUCTURE      : ${servedEither}  (${pct(servedEither, total)})`);
    console.log(`   → gain net apporté par la structure: +${gainStructOnly} membres`);
    console.log(`Non desservis (ni ville ni structure) : ${remainingNon}  (${pct(remainingNon, total)})`);
    console.log('--------------------------------------------');

    // ---- Table « Répartition par zone » (modèle structure + sous-arbre) ----
    console.log('\n===== RÉPARTITION PAR ZONE — MODÈLE STRUCTURE + SOUS-ARBRE =====');
    const H =
      'ZONE'.padEnd(8) +
      'RÉGION'.padEnd(26) +
      'RESPONSABLE'.padEnd(26) +
      'VILLES'.padStart(7) +
      'ABONNÉS'.padStart(9) +
      '%BESOIN'.padStart(9);
    console.log(H);
    console.log('-'.repeat(H.length));
    for (const r of zoneStructRows) {
      console.log(
        `Z${r.number}`.padEnd(8) +
          trunc(r.region, 25).padEnd(26) +
          trunc(r.responsable, 25).padEnd(26) +
          String(r.villes).padStart(7) +
          String(r.abonnes).padStart(9) +
          pct(r.abonnes, total).padStart(9),
      );
    }
    console.log('-'.repeat(H.length));
    console.log(
      'NR'.padEnd(8) +
        'Non rattachés (structure)'.padEnd(26) +
        ''.padEnd(26) +
        ''.padStart(7) +
        String(nonRattachesStruct).padStart(9) +
        pct(nonRattachesStruct, total).padStart(9),
    );
    console.log(
      'TOTAL'.padEnd(8) +
        ''.padEnd(26) +
        ''.padEnd(26) +
        ''.padStart(7) +
        String(total).padStart(9) +
        pct(total, total).padStart(9),
    );
    console.log(
      `(zones avec structure configurée mais 0 abonné par ce modèle : ${zonesStructZero})`,
    );
    console.log(
      `\n>>> « Non rattachés » — ville : ${unservedTotal} (${pct(unservedTotal, total)})  |  structure : ${nonRattachesStruct} (${pct(nonRattachesStruct, total)})  |  ville+structure : ${total - servedEither} (${pct(total - servedEither, total)})`,
    );

    // ---- Cohérence & anti-doublon ----
    console.log('\n===== COHÉRENCE & ANTI-DOUBLON =====');
    console.log(
      `Membres distincts (uuid)                      : ${distinctMembers} / ${total}  ${distinctMembers === total ? '✅' : '⚠️ INCOHÉRENT'}`,
    );
    console.log(
      `Décompte VILLE réconcilié (1 membre = 1×)     : ${cityReconc ? '✅ OK' : '⚠️ FAIL'}`,
    );
    console.log(
      `Décompte STRUCTURE réconcilié (1 membre = 1×) : ${structReconc ? '✅ OK' : '⚠️ FAIL'}  (Σzones ${structSum} + non-rattachés ${nonRattachesStruct})`,
    );
    console.log('--------------------------------------------');
    console.log(`Villes rattachées à PLUSIEURS zones           : ${multiZoneCitySet.size}`);
    console.log(
      `  → membres dont la ville est ambiguë (Abidjan…): ${membersMultiZoneCity}  (${pct(membersMultiZoneCity, total)})`,
    );
    if (multiZoneCitySet.size) {
      const topMulti = Array.from(multiZoneCitySet)
        .map((cu) => ({
          name: cityMap.get(cu)?.name ?? '(inconnue)',
          zones: cityZones.get(cu)?.size ?? 0,
        }))
        .sort((a, b) => b.zones - a.zones)
        .slice(0, 10);
      for (const r of topMulti)
        console.log(`      • ${trunc(r.name, 28).padEnd(29)} ${r.zones} zones`);
    }
    console.log('--------------------------------------------');
    console.log(
      `Doublons de personnes — téléphone     : ${dupPhone.groupCount} groupes, +${dupPhone.extra} lignes en trop`,
    );
    console.log(
      `Doublons de personnes — matricule     : ${dupMatricule.groupCount} groupes, +${dupMatricule.extra} lignes en trop`,
    );
    console.log(
      `Doublons de personnes — nom+naissance : ${dupNameBirth.groupCount} groupes, +${dupNameBirth.extra} lignes en trop`,
    );
    console.log('  (ces lignes en trop gonflent TOUS les décomptes — à fusionner à la source)');

    console.log('\nTOP villes à rattacher à une zone (worklist) :');
    if (worklist.length === 0) {
      console.log('  (aucune — toutes les villes avec membres sont desservies)');
    } else {
      worklist.slice(0, 30).forEach((w, i) => {
        const name = w.name.length > 30 ? w.name.slice(0, 29) + '…' : w.name;
        console.log(
          `  ${String(i + 1).padStart(2)}. ${name.padEnd(30)} ${String(w.members).padStart(5)} membres`,
        );
      });
      if (worklist.length > 30) console.log(`  … +${worklist.length - 30} autres villes`);
    }

    // ---- Export CSV worklist ----
    const csvPath = path.resolve(__dirname, '../../zone-coverage-worklist.csv');
    const BOM = String.fromCharCode(0xfeff);
    const header = 'ville;city_uuid;membres_non_desservis;type';
    const rows = worklist.map(
      (w) => `"${w.name.replace(/"/g, '""')}";${w.city_uuid};${w.members};${w.kind}`,
    );
    fs.writeFileSync(csvPath, BOM + [header, ...rows].join('\n'), 'utf8');
    console.log(`\n[audit] Worklist exportée -> ${csvPath}`);

    // CSV — répartition par zone (modèle structure + sous-arbre).
    const zPath = path.resolve(__dirname, '../../zone-distribution-structure.csv');
    const zHeader = 'zone_numero;zone;region;responsable;villes;abonnes;pourcent';
    const zRows = zoneStructRows.map(
      (r) =>
        `${r.number};"${r.zone.replace(/"/g, '""')}";"${r.region.replace(/"/g, '""')}";"${r.responsable.replace(/"/g, '""')}";${r.villes};${r.abonnes};${pct(r.abonnes, total)}`,
    );
    zRows.push(`;"Non rattachés";"";"";;${nonRattachesStruct};${pct(nonRattachesStruct, total)}`);
    zRows.push(`;"TOTAL";"";"";;${total};100%`);
    fs.writeFileSync(zPath, BOM + [zHeader, ...zRows].join('\n'), 'utf8');
    console.log(`[audit] Répartition par zone (structure) -> ${zPath}`);

    // CSV — doublons de personnes (worklist de fusion).
    const memberById = new Map(members.map((m) => [m.uuid, m]));
    const dupHeader = 'signal;cle;uuid;matricule;nom;telephone';
    const dupRows: string[] = [];
    const emitDup = (signal: string, groups: [string, string[]][]) => {
      for (const [key, ids] of groups) {
        for (const id of ids) {
          const m = memberById.get(id) as unknown as {
            matricule?: string;
            firstname?: string;
            lastname?: string;
            phone?: string;
          };
          const nom = `${m?.lastname ?? ''} ${m?.firstname ?? ''}`.trim();
          dupRows.push(
            `${signal};"${key.replace(/"/g, '""')}";${id};"${(m?.matricule ?? '').replace(/"/g, '""')}";"${nom.replace(/"/g, '""')}";${normPhone(m?.phone)}`,
          );
        }
      }
    };
    emitDup('telephone', dupPhone.groups);
    emitDup('matricule', dupMatricule.groups);
    emitDup('nom+naissance', dupNameBirth.groups);
    const dupPath = path.resolve(__dirname, '../../person-duplicates.csv');
    fs.writeFileSync(dupPath, BOM + [dupHeader, ...dupRows].join('\n'), 'utf8');
    console.log(`[audit] Doublons de personnes -> ${dupPath}`);
    console.log('[audit] (lecture seule — aucune écriture en base)');
  } finally {
    await AppDataSource.destroy();
  }
}

run().catch((e) => {
  console.error('[audit] Échec :', e);
  process.exit(1);
});
