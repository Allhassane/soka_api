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
 * AUDIT - Responsabilités « cassées » (LECTURE SEULE).
 *
 * Reproduit la logique de l'auth (auth.service : getStructureTreeForResponsible +
 * findStructureByLevelUuid) qui attache une `structure` à chaque responsabilité.
 * Cette structure est trouvée en cherchant, dans la CHAÎNE D'ANCÊTRES de
 * `member.structure_uuid` (structure du membre → … → racine), un nœud dont le
 * `level_uuid` = celui de la responsabilité.
 *
 * Une responsabilité est donc « cassée » quand son niveau n'est PAS présent dans
 * la chaîne d'ancêtres de la structure du membre → `structure = null` côté
 * payload (c'est le cas qui faisait planter le header sur `.structure.name`).
 *
 * On rapporte aussi les membres qui ont des responsabilités mais AUCUNE
 * structure (`structure_uuid` nul) : leurs responsabilités ne s'affichent pas.
 *
 * Sortie : matricule, nom, numéro de connexion (téléphone de login), structure
 * et niveau du membre, responsabilité concernée, niveau de cassure. + CSV.
 * N'écrit RIEN en base.
 *
 * Exécution (depuis soka_api) :
 *   npm run seed:broken-responsibilities-audit
 */

type RespRow = {
  member_uuid: string;
  responsibility_name: string;
  level_uuid: string | null;
  level_name: string | null;
  level_order: number | string | null;
};

async function run() {
  const ds = await AppDataSource.initialize();
  console.log(`[audit] Base cible : ${ds.options.database as string}`);

  try {
    const structureRepo = ds.getRepository(StructureEntity);
    const levelRepo = ds.getRepository(LevelEntity);
    const memberRepo = ds.getRepository(MemberEntity);
    const userRepo = ds.getRepository(User);

    // 1. Référentiel des structures (uuid -> name, parent_uuid, level_uuid).
    const structures = await structureRepo.find({
      select: ['uuid', 'name', 'parent_uuid', 'level_uuid'] as (keyof StructureEntity)[],
    });
    const structByUuid = new Map(structures.map((s) => [s.uuid, s]));

    // 2. Niveaux.
    const levels = await levelRepo.find();
    const levelName = new Map(levels.map((l) => [l.uuid, l.name]));

    // 3. Ensemble des level_uuid le long de la chaîne d'ancêtres (mémoïsé).
    const ancestorLevelsMemo = new Map<string, Set<string | null>>();
    const ancestorLevelSet = (structureUuid: string | null): Set<string | null> => {
      if (!structureUuid) return new Set();
      const cached = ancestorLevelsMemo.get(structureUuid);
      if (cached) return cached;
      const set = new Set<string | null>();
      const seen = new Set<string>();
      let cur: string | null = structureUuid;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        const s = structByUuid.get(cur) as unknown as
          | { level_uuid: string | null; parent_uuid: string | null }
          | undefined;
        if (!s) break;
        set.add(s.level_uuid ?? null);
        let p = s.parent_uuid ?? null;
        if (p && p.trim() === '') p = null;
        cur = p;
      }
      ancestorLevelsMemo.set(structureUuid, set);
      return set;
    };

    // 4. Responsabilités par membre (une seule requête).
    const rrows: RespRow[] = await ds.query(
      `SELECT mr.member_uuid            AS member_uuid,
              r.name                    AS responsibility_name,
              r.level_uuid              AS level_uuid,
              l.name                    AS level_name,
              l.\`order\`                AS level_order
       FROM member_responsibilities mr
       JOIN responsibilities r ON r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL
       LEFT JOIN levels l ON l.uuid = r.level_uuid
       WHERE mr.deleted_at IS NULL`,
    );
    const respByMember = new Map<string, RespRow[]>();
    for (const row of rrows) {
      if (!row.member_uuid) continue;
      const arr = respByMember.get(row.member_uuid) ?? [];
      arr.push(row);
      respByMember.set(row.member_uuid, arr);
    }

    // 5. Infos membres + numéro de connexion (téléphone du compte utilisateur).
    const memberUuids = Array.from(respByMember.keys());
    const memberInfo = new Map<string, MemberEntity>();
    const loginByMember = new Map<string, string>();
    const chunk = 500;
    for (let i = 0; i < memberUuids.length; i += chunk) {
      const part = memberUuids.slice(i, i + chunk);
      const [ms, us] = await Promise.all([
        memberRepo.find({
          where: { uuid: In(part) },
          select: [
            'uuid',
            'structure_uuid',
            'matricule',
            'firstname',
            'lastname',
            'phone',
          ] as (keyof MemberEntity)[],
        }),
        userRepo.find({
          where: { member_uuid: In(part) },
          select: ['member_uuid', 'phone_number'] as (keyof User)[],
        }),
      ]);
      for (const m of ms) memberInfo.set(m.uuid, m);
      for (const u of us) {
        const mu = (u as unknown as { member_uuid?: string }).member_uuid;
        const ph = (u as unknown as { phone_number?: string }).phone_number;
        if (mu && ph) loginByMember.set(mu, ph);
      }
    }

    // 6. Détection.
    type BrokenRow = {
      matricule: string;
      nom: string;
      login: string;
      structure_membre: string;
      niveau_structure_membre: string;
      responsabilite: string;
      niveau_cassure: string;
      type: 'structure_non_resolue' | 'membre_sans_structure';
    };
    const broken: BrokenRow[] = [];
    let membersWithResp = 0;
    let brokenMembersA = new Set<string>();
    let brokenMembersB = new Set<string>();

    for (const [memberUuid, resps] of respByMember) {
      const m = memberInfo.get(memberUuid);
      if (!m) continue; // membre soft-deleted / introuvable
      membersWithResp++;

      const nom = `${(m as unknown as { lastname?: string }).lastname ?? ''} ${(m as unknown as { firstname?: string }).firstname ?? ''}`.trim();
      const matricule = (m as unknown as { matricule?: string }).matricule ?? '';
      const memberPhone = (m as unknown as { phone?: string }).phone ?? '';
      const login = loginByMember.get(memberUuid) || memberPhone || '-';
      const su = (m as unknown as { structure_uuid?: string | null }).structure_uuid ?? null;

      // Cas B : membre sans structure → responsabilités non affichées.
      if (!su) {
        brokenMembersB.add(memberUuid);
        for (const r of resps) {
          broken.push({
            matricule,
            nom,
            login,
            structure_membre: '(aucune)',
            niveau_structure_membre: '(aucun)',
            responsabilite: r.responsibility_name,
            niveau_cassure: r.level_name ?? '(niveau inconnu)',
            type: 'membre_sans_structure',
          });
        }
        continue;
      }

      // Le back n'inclut les responsabilités que s'il existe ≥1 responsabilité
      // « valide » (level_order non nul). Sinon rien n'est affiché → pas de crash.
      const validCount = resps.filter(
        (r) => r.level_order !== null && r.level_order !== undefined,
      ).length;
      if (validCount === 0) continue;

      const levelsInChain = ancestorLevelSet(su);
      const mStruct = structByUuid.get(su);
      const mStructName = mStruct?.name ?? '(introuvable)';
      const mStructLevel = mStruct?.level_uuid
        ? (levelName.get(mStruct.level_uuid) ?? 'Inconnu')
        : 'Inconnu';

      const brokenResps = resps.filter(
        (r) => !levelsInChain.has(r.level_uuid ?? null),
      );
      if (brokenResps.length > 0) {
        brokenMembersA.add(memberUuid);
        for (const r of brokenResps) {
          broken.push({
            matricule,
            nom,
            login,
            structure_membre: mStructName,
            niveau_structure_membre: mStructLevel,
            responsabilite: r.responsibility_name,
            niveau_cassure: r.level_name ?? '(niveau inconnu)',
            type: 'structure_non_resolue',
          });
        }
      }
    }

    // ---- Rapport ----
    console.log('\n========== AUDIT RESPONSABILITÉS CASSÉES ==========');
    console.log(`Membres avec responsabilités        : ${membersWithResp}`);
    console.log(
      `Membres CASSÉS (structure non résolue): ${brokenMembersA.size}`,
    );
    console.log(
      `Membres sans structure (resp. cachées): ${brokenMembersB.size}`,
    );
    console.log(`Lignes cassées (détail)             : ${broken.length}`);
    console.log('---------------------------------------------------');

    const preview = broken.slice(0, 25);
    for (const b of preview) {
      console.log(
        `• ${(b.matricule || '-').padEnd(9)} ${b.nom.padEnd(26).slice(0, 26)} | login ${b.login.padEnd(12)} | ${b.responsabilite} @ ${b.niveau_cassure}  [${b.type === 'membre_sans_structure' ? 'sans structure membre' : 'niveau hors chaîne'}]`,
      );
    }
    if (broken.length > 25) console.log(`… +${broken.length - 25} lignes (voir CSV).`);

    // ---- CSV ----
    const BOM = String.fromCharCode(0xfeff);
    const header =
      'matricule;nom;numero_connexion;structure_membre;niveau_structure_membre;responsabilite_cassee;niveau_cassure;type_cassure';
    const rows = broken.map((b) =>
      [
        b.matricule,
        `"${b.nom.replace(/"/g, '""')}"`,
        b.login,
        `"${b.structure_membre.replace(/"/g, '""')}"`,
        `"${b.niveau_structure_membre.replace(/"/g, '""')}"`,
        `"${b.responsabilite.replace(/"/g, '""')}"`,
        `"${b.niveau_cassure.replace(/"/g, '""')}"`,
        b.type,
      ].join(';'),
    );
    const csvPath = path.resolve(__dirname, '../../broken-responsibilities.csv');
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
