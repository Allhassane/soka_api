import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { In } from 'typeorm';
import AppDataSource from '../data-source';
import { MemberEntity } from '../members/entities/member.entity';
import { StructureEntity } from '../structure/entities/structure.entity';
import { LevelEntity } from '../level/entities/level.entity';
import { User } from '../users/entities/user.entity';

/**
 * AUDIT — Chaînes de structure incomplètes (LECTURE SEULE).
 *
 * On extrait tous les membres dont l'ARBRE de structure ne remonte PAS jusqu'au
 * niveau NATIONAL. Concrètement, en partant de `member.structure_uuid` et en
 * remontant via `parent_uuid` (comme le CTE de l'auth), la chaîne doit atteindre
 * une structure de niveau NATIONAL (order minimal). Si elle s'arrête avant
 * (parent nul, parent introuvable, cycle), l'arbre est « cassé » — c'est ce qui
 * empêche ensuite certaines responsabilités de résoudre leur structure.
 *
 * Pour chaque membre concerné : matricule, nom, numéro de connexion (téléphone du
 * compte), structure + niveau du membre, profondeur de la chaîne, niveau MAX
 * atteint, raison de l'arrêt, et le chemin des niveaux. + CSV.
 * N'écrit RIEN en base.
 *
 * Exécution (depuis soka_api) :
 *   npm run seed:orphan-structure-chains-audit
 */

type ChainResult = {
  reaches: boolean;
  depth: number;
  levelsPath: string[];
  topName: string;
  topLevel: string;
  stopReason:
    | 'atteint_national'
    | 'parent_nul'
    | 'parent_introuvable'
    | 'cycle'
    | 'structure_introuvable';
};

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[audit] Base cible : ${ds.options.database as string}`);

  try {
    const structureRepo = ds.getRepository(StructureEntity);
    const levelRepo = ds.getRepository(LevelEntity);
    const memberRepo = ds.getRepository(MemberEntity);
    const userRepo = ds.getRepository(User);

    // 1. Structures.
    const structures = await structureRepo.find({
      select: ['uuid', 'name', 'parent_uuid', 'level_uuid'] as (keyof StructureEntity)[],
    });
    const structByUuid = new Map(
      structures.map((s) => [
        s.uuid,
        s as unknown as {
          uuid: string;
          name: string;
          parent_uuid: string | null;
          level_uuid: string | null;
        },
      ]),
    );

    // 2. Niveaux : uuid -> {name, order}. « National » = order minimal.
    const levels = await levelRepo.find();
    const levelName = new Map(levels.map((l) => [l.uuid, l.name]));
    const levelOrder = new Map(levels.map((l) => [l.uuid, l.order]));
    const topOrder = levels.length
      ? Math.min(...levels.map((l) => l.order))
      : 0;
    const nationalLevelName =
      levels.find((l) => l.order === topOrder)?.name ?? `order ${topOrder}`;

    const normUuid = (p: string | null | undefined): string | null =>
      p && p.trim() !== '' ? p : null;

    // 3. Remontée d'une structure jusqu'au sommet (mémoïsée par structure).
    const memo = new Map<string, ChainResult>();
    const chainInfo = (startUuid: string): ChainResult => {
      const cached = memo.get(startUuid);
      if (cached) return cached;
      const seen = new Set<string>();
      const pathLevels: string[] = [];
      let cur: string | null = startUuid;
      let reaches = false;
      let stopReason: ChainResult['stopReason'] = 'parent_nul';
      let topName = '';
      let topLevel = '';
      while (cur) {
        if (seen.has(cur)) {
          stopReason = 'cycle';
          break;
        }
        seen.add(cur);
        const node = structByUuid.get(cur);
        if (!node) {
          stopReason =
            pathLevels.length === 0 ? 'structure_introuvable' : 'parent_introuvable';
          break;
        }
        const lvl = node.level_uuid ? (levelName.get(node.level_uuid) ?? 'Inconnu') : 'Inconnu';
        pathLevels.push(lvl);
        topName = node.name;
        topLevel = lvl;
        const ord = node.level_uuid ? levelOrder.get(node.level_uuid) : undefined;
        if (ord !== undefined && ord === topOrder) {
          reaches = true;
          stopReason = 'atteint_national';
          break;
        }
        const p = normUuid(node.parent_uuid);
        if (!p) {
          stopReason = 'parent_nul';
          break;
        }
        cur = p;
      }
      const res: ChainResult = {
        reaches,
        depth: pathLevels.length,
        levelsPath: pathLevels,
        topName,
        topLevel,
        stopReason,
      };
      memo.set(startUuid, res);
      return res;
    };

    // 4. Tous les membres (non soft-deleted).
    const members = await memberRepo.find({
      select: [
        'uuid',
        'structure_uuid',
        'matricule',
        'firstname',
        'lastname',
        'phone',
      ] as (keyof MemberEntity)[],
    });

    type Row = {
      member_uuid: string;
      matricule: string;
      nom: string;
      phone: string;
      structure_membre: string;
      niveau_membre: string;
      depth: number;
      niveau_max: string;
      raison: string;
      chaine: string;
      type: 'chaine_incomplete' | 'sans_structure';
    };
    const rows: Row[] = [];
    let totalMembers = 0;
    let sansStructure = 0;
    let incomplete = 0;
    const stopStats = new Map<string, number>();
    const byMemberLevel = new Map<string, number>();

    for (const m of members) {
      totalMembers++;
      const su = (m as unknown as { structure_uuid?: string | null }).structure_uuid ?? null;
      const nom = `${(m as unknown as { lastname?: string }).lastname ?? ''} ${(m as unknown as { firstname?: string }).firstname ?? ''}`.trim();
      const matricule = (m as unknown as { matricule?: string }).matricule ?? '';
      const phone = (m as unknown as { phone?: string }).phone ?? '';

      if (!su) {
        sansStructure++;
        rows.push({
          member_uuid: m.uuid,
          matricule,
          nom,
          phone,
          structure_membre: '(aucune)',
          niveau_membre: '(aucun)',
          depth: 0,
          niveau_max: '(aucun)',
          raison: 'sans_structure',
          chaine: '',
          type: 'sans_structure',
        });
        continue;
      }

      const info = chainInfo(su);
      if (info.reaches) continue; // chaîne OK jusqu'au national

      incomplete++;
      stopStats.set(info.stopReason, (stopStats.get(info.stopReason) ?? 0) + 1);
      const memberLevel = info.levelsPath[0] ?? 'Inconnu';
      byMemberLevel.set(memberLevel, (byMemberLevel.get(memberLevel) ?? 0) + 1);

      rows.push({
        member_uuid: m.uuid,
        matricule,
        nom,
        phone,
        structure_membre: structByUuid.get(su)?.name ?? '(introuvable)',
        niveau_membre: memberLevel,
        depth: info.depth,
        niveau_max: info.topLevel || '(aucun)',
        raison: info.stopReason,
        chaine: info.levelsPath.join(' > '),
        type: 'chaine_incomplete',
      });
    }

    // 5. Numéro de connexion (téléphone du compte) pour les membres extraits.
    const affected = rows.map((r) => r.member_uuid);
    const loginByMember = new Map<string, string>();
    const chunk = 500;
    for (let i = 0; i < affected.length; i += chunk) {
      const part = affected.slice(i, i + chunk);
      const us = await userRepo.find({
        where: { member_uuid: In(part) },
        select: ['member_uuid', 'phone_number'] as (keyof User)[],
      });
      for (const u of us) {
        const mu = (u as unknown as { member_uuid?: string }).member_uuid;
        const ph = (u as unknown as { phone_number?: string }).phone_number;
        if (mu && ph) loginByMember.set(mu, ph);
      }
    }
    const loginOf = (r: Row) => loginByMember.get(r.member_uuid) || r.phone || '—';

    // ---- Rapport ----
    console.log('\n===== AUDIT CHAÎNES DE STRUCTURE (n\'atteignant pas le NATIONAL) =====');
    console.log(`Niveau sommet (national)            : ${nationalLevelName} (order ${topOrder})`);
    console.log(`Membres analysés                    : ${totalMembers}`);
    console.log(`Chaîne incomplète (≠ national)      : ${incomplete}`);
    console.log(`Sans structure (aucun arbre)        : ${sansStructure}`);
    console.log('-------------------------------------------------------------');
    console.log('Raison d\'arrêt (chaînes incomplètes) :');
    for (const [k, v] of Array.from(stopStats.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`   • ${k.padEnd(22)} : ${v}`);
    }
    console.log('Niveau du membre (chaînes incomplètes) :');
    for (const [k, v] of Array.from(byMemberLevel.entries()).sort((a, b) => b[1] - a[1])) {
      console.log(`   • ${k.padEnd(22)} : ${v}`);
    }
    console.log('-------------------------------------------------------------');

    const preview = rows.filter((r) => r.type === 'chaine_incomplete').slice(0, 25);
    for (const r of preview) {
      console.log(
        `• ${(r.matricule || '—').padEnd(9)} ${r.nom.padEnd(24).slice(0, 24)} | login ${loginOf(r).padEnd(12)} | ${r.chaine}  ✗ ${r.raison}`,
      );
    }
    if (incomplete > 25) console.log(`… +${incomplete - 25} membres (voir CSV).`);

    // ---- CSV ----
    const BOM = String.fromCharCode(0xfeff);
    const header =
      'matricule;nom;numero_connexion;structure_membre;niveau_membre;profondeur;niveau_max_atteint;raison_arret;chaine_niveaux;type';
    const csvRows = rows.map((r) =>
      [
        r.matricule,
        `"${r.nom.replace(/"/g, '""')}"`,
        loginOf(r),
        `"${r.structure_membre.replace(/"/g, '""')}"`,
        `"${r.niveau_membre.replace(/"/g, '""')}"`,
        r.depth,
        `"${r.niveau_max.replace(/"/g, '""')}"`,
        r.raison,
        `"${r.chaine.replace(/"/g, '""')}"`,
        r.type,
      ].join(';'),
    );
    const csvPath = path.resolve(__dirname, '../../orphan-structure-chains.csv');
    fs.writeFileSync(csvPath, BOM + [header, ...csvRows].join('\n'), 'utf8');
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
