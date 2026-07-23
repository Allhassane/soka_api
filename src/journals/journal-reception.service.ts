import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { JournalEditionEntity } from './entities/journal-edition.entity';
import { JournalDistrictReceptionEntity } from './entities/journal-district-reception.entity';
import { JournalMemberReceptionEntity } from './entities/journal-member-reception.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

type ChainNode = {
  uuid: string;
  name: string;
  level_uuid: string | null;
  level_name: string;
};

type ReceptionMember = {
  member_uuid: string;
  name: string;
  phone: string | null;
  structure_path: { level: string; name: string }[];
  quantity: number;
  received: boolean;
  received_at: Date | null;
};

type ReceptionDistrict = {
  district_uuid: string | null;
  district_name: string;
  region: string | null;
  responsible_name: string | null;
  responsible_phone: string | null;
  member_total: number;
  member_received: number;
  reception_rate: number;
  lot_received: boolean;
  lot_received_at: Date | null;
  status: 'received' | 'pending' | 'late';
  /** L'utilisateur connecté peut-il valider ce district (écriture) ? */
  can_validate: boolean;
  members: ReceptionMember[];
};

const NO_DISTRICT = '__none__';

/**
 * Périmètre d'action de l'utilisateur connecté.
 * - `all` : admin ou responsable NATIONAL → voit et valide tout.
 * - `scopeRootUuid` : racine du sous-arbre visible (LECTURE). null si `all`.
 * - `directDistrictUuids` : districts dont l'utilisateur est le responsable
 *   DIRECT (ÉCRITURE). Modèle strict : seul le responsable direct valide.
 */
type UserScope = {
  all: boolean;
  scopeRootUuid: string | null;
  scopeLevelName: string | null;
  directDistrictUuids: Set<string>;
  /** member_uuid de l'utilisateur connecté (pour le self-service). */
  memberUuid: string | null;
};

/**
 * Suivi de la RÉCEPTION structurelle d'une édition (cascade District → Membre),
 * en parallèle de la distribution géographique par zone.
 *  - les districts/membres sont DÉRIVÉS des abonnés payés (jamais matérialisés) ;
 *  - seuls les ÉTATS de validation (lot district + membre) sont stockés ;
 *  - 100 % en mémoire + requêtes mono-table In(...) → insensible aux collations.
 */
@Injectable()
export class JournalReceptionService {
  constructor(
    @InjectRepository(JournalEditionEntity)
    private readonly editionRepo: Repository<JournalEditionEntity>,
    @InjectRepository(JournalDistrictReceptionEntity)
    private readonly districtRecRepo: Repository<JournalDistrictReceptionEntity>,
    @InjectRepository(JournalMemberReceptionEntity)
    private readonly memberRecRepo: Repository<JournalMemberReceptionEntity>,
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,
    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,
    @InjectRepository(SubscriptionPaymentEntity)
    private readonly subPaymentRepo: Repository<SubscriptionPaymentEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly logService: LogActivitiesService,
  ) {}

  private async getAdmin(uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    return admin;
  }

  /** Map des niveaux (uuid → nom) + uuid du niveau "district" (par nom). */
  private async loadLevels(): Promise<{
    levelName: Map<string, string>;
    districtLevelUuid: string | null;
    regionLevelUuid: string | null;
  }> {
    const rows: { uuid: string; name: string }[] =
      await this.structureRepo.manager.query('SELECT uuid, name FROM levels');
    const levelName = new Map(rows.map((l) => [l.uuid, l.name]));
    const norm = (s: string) => (s ?? '').toLowerCase().trim();
    const district = rows.find((l) => norm(l.name).includes('district'));
    const region = rows.find((l) => {
      const n = norm(l.name);
      return n.includes('region') || n.includes('région');
    });
    return {
      levelName,
      districtLevelUuid: district?.uuid ?? null,
      regionLevelUuid: region?.uuid ?? null,
    };
  }

  /**
   * Chaîne de structure (racine → feuille) par structure feuille, avec uuid +
   * niveau de chaque maillon. Remontée parent_uuid EN MÉMOIRE (aucun JOIN).
   */
  private async resolveChains(
    leafUuids: string[],
    levelName: Map<string, string>,
  ): Promise<Map<string, ChainNode[]>> {
    const result = new Map<string, ChainNode[]>();
    const leaves = Array.from(new Set(leafUuids.filter(Boolean)));
    if (!leaves.length) return result;

    const structMap = new Map<
      string,
      { name: string; parent_uuid: string | null; level_uuid: string | null }
    >();
    let frontier = leaves.slice();
    while (frontier.length) {
      const toLoad = frontier.filter((u) => u && !structMap.has(u));
      if (!toLoad.length) break;
      const rows = await this.structureRepo.find({
        where: { uuid: In(toLoad) },
        select: ['uuid', 'name', 'parent_uuid', 'level_uuid'],
      });
      frontier = [];
      for (const s of rows) {
        const parent = (s as { parent_uuid?: string | null }).parent_uuid ?? null;
        structMap.set(s.uuid, {
          name: s.name,
          parent_uuid: parent,
          level_uuid: (s as { level_uuid?: string | null }).level_uuid ?? null,
        });
        if (parent && parent.trim() && !structMap.has(parent)) {
          frontier.push(parent);
        }
      }
    }

    for (const leaf of leaves) {
      const chain: ChainNode[] = [];
      const seen = new Set<string>();
      let cur: string | null = leaf;
      while (cur && structMap.has(cur) && !seen.has(cur)) {
        seen.add(cur);
        const s = structMap.get(cur)!;
        chain.push({
          uuid: cur,
          name: s.name,
          level_uuid: s.level_uuid,
          level_name: s.level_uuid ? (levelName.get(s.level_uuid) ?? '') : '',
        });
        cur = s.parent_uuid && s.parent_uuid.trim() ? s.parent_uuid : null;
      }
      result.set(leaf, chain.reverse()); // racine → feuille
    }
    return result;
  }

  /**
   * Responsable enregistré de chaque district : membre dont members.structure_uuid
   * = le district ET qui porte une responsabilité (priorité au niveau district).
   * Requêtes mono-table In(...) → collation-safe (aucun JOIN vers members).
   */
  private async resolveDistrictResponsibles(
    districtUuids: string[],
    districtLevelUuid: string | null,
    levelName: Map<string, string>,
  ): Promise<
    Map<string, { member_uuid: string; name: string; phone: string | null }>
  > {
    const out = new Map<
      string,
      { member_uuid: string; name: string; phone: string | null }
    >();
    const ids = new Set(districtUuids.filter(Boolean));
    if (!ids.size || !districtLevelUuid) return out;

    // 1) Membres portant une responsabilité de NIVEAU district. Le membre peut
    //    être positionné sous le district (sous-groupe…) tout en étant le
    //    responsable du district — comme dans auth.service, on remonte ensuite
    //    jusqu'au maillon district de sa structure. JOIN interne utf8mb4 (pas de
    //    JOIN vers members) → collation-safe.
    const rows: { member_uuid: string }[] =
      await this.structureRepo.manager.query(
        `SELECT DISTINCT mr.member_uuid AS member_uuid
         FROM member_responsibilities mr
         INNER JOIN responsibilities r
           ON r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL
         WHERE mr.deleted_at IS NULL AND r.level_uuid = ?`,
        [districtLevelUuid],
      );
    const respUuids = Array.from(
      new Set(rows.map((r) => r.member_uuid).filter(Boolean)),
    );
    if (!respUuids.length) return out;

    // 2) Charger ces membres (mono-table members, par lots)
    const members: MemberEntity[] = [];
    const chunk = 500;
    for (let i = 0; i < respUuids.length; i += chunk) {
      const ms = await this.memberRepo.find({
        where: { uuid: In(respUuids.slice(i, i + chunk)) },
        select: ['uuid', 'firstname', 'lastname', 'phone', 'structure_uuid'],
      });
      members.push(...ms);
    }
    if (!members.length) return out;

    // 3) Remonter chaque responsable jusqu'à son district, mapper aux districts demandés
    const chains = await this.resolveChains(
      members.map((m) => m.structure_uuid).filter(Boolean) as string[],
      levelName,
    );
    for (const m of members) {
      if (!m.structure_uuid) continue;
      const chain = chains.get(m.structure_uuid) ?? [];
      const dUuid = chain.find((c) => c.level_uuid === districtLevelUuid)?.uuid;
      if (dUuid && ids.has(dUuid) && !out.has(dUuid)) {
        out.set(dUuid, {
          member_uuid: m.uuid,
          name: `${m.lastname ?? ''} ${m.firstname ?? ''}`.trim(),
          phone: m.phone ?? null,
        });
      }
    }
    return out;
  }

  /**
   * Résout le PÉRIMÈTRE de l'utilisateur connecté à partir de sa structure et
   * de ses responsabilités (niveaux). Sécurité :
   *  - admin (`is_admin`) ou responsable NATIONAL → périmètre total ;
   *  - sinon LECTURE = sous-arbre de la structure au niveau le plus élevé
   *    détenu ; ÉCRITURE = uniquement le(s) district(s) dont il est le
   *    responsable direct (modèle strict).
   */
  private async resolveUserScope(admin_uuid: string): Promise<UserScope> {
    const admin = await this.getAdmin(admin_uuid);
    const memberUuid = admin.member_uuid ?? null;
    const strictEmpty: UserScope = {
      all: false,
      scopeRootUuid: null,
      scopeLevelName: null,
      directDistrictUuids: new Set<string>(),
      memberUuid,
    };

    // Admin applicatif → tout
    if ((admin as { is_admin?: boolean }).is_admin) {
      return {
        all: true,
        scopeRootUuid: null,
        scopeLevelName: 'ADMIN',
        directDistrictUuids: new Set<string>(),
        memberUuid,
      };
    }
    if (!admin.member_uuid) return strictEmpty;

    const member = await this.memberRepo.findOne({
      where: { uuid: admin.member_uuid },
      select: ['uuid', 'structure_uuid'],
    });

    // Niveaux de responsabilité détenus par le membre (collation-safe : pas de
    // JOIN vers members).
    const rows: { level_uuid: string; level_name: string; level_order: number }[] =
      await this.structureRepo.manager.query(
        `SELECT DISTINCT l.uuid AS level_uuid, l.name AS level_name, l.\`order\` AS level_order
         FROM member_responsibilities mr
         INNER JOIN responsibilities r
           ON r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL
         INNER JOIN levels l ON l.uuid = r.level_uuid
         WHERE mr.deleted_at IS NULL AND mr.member_uuid = ?`,
        [admin.member_uuid],
      );

    // Responsable NATIONAL (order 0) → tout
    const isNational = rows.some(
      (r) =>
        Number(r.level_order) === 0 ||
        (r.level_name ?? '').toUpperCase() === 'NATIONAL',
    );
    if (isNational) {
      return {
        all: true,
        scopeRootUuid: null,
        scopeLevelName: 'NATIONAL',
        directDistrictUuids: new Set<string>(),
        memberUuid,
      };
    }

    if (!rows.length || !member?.structure_uuid) return strictEmpty;

    const { levelName, districtLevelUuid } = await this.loadLevels();
    const chains = await this.resolveChains([member.structure_uuid], levelName);
    const chain = chains.get(member.structure_uuid) ?? []; // racine → feuille
    const heldLevelUuids = new Set(rows.map((r) => r.level_uuid));

    // LECTURE : nœud le plus haut (proche racine) de la chaîne dont le niveau
    // est détenu par l'utilisateur = racine du périmètre visible.
    let scopeRootUuid: string | null = null;
    let scopeLevelName: string | null = null;
    for (const node of chain) {
      if (node.level_uuid && heldLevelUuids.has(node.level_uuid)) {
        scopeRootUuid = node.uuid;
        scopeLevelName = node.level_name;
        break;
      }
    }
    if (!scopeRootUuid) scopeRootUuid = member.structure_uuid; // repli restrictif

    // ÉCRITURE : district(s) dont l'utilisateur est le responsable DIRECT.
    const directDistrictUuids = new Set<string>();
    const holdsDistrict = !!districtLevelUuid && heldLevelUuids.has(districtLevelUuid);
    if (holdsDistrict && districtLevelUuid) {
      const districtNode = chain.find((c) => c.level_uuid === districtLevelUuid);
      if (districtNode) directDistrictUuids.add(districtNode.uuid);
    }

    return {
      all: false,
      scopeRootUuid,
      scopeLevelName,
      directDistrictUuids,
      memberUuid,
    };
  }

  /** True si l'utilisateur peut VALIDER (écriture) le district donné. */
  private canValidateDistrict(scope: UserScope, districtUuid: string | null) {
    if (scope.all) return true;
    if (!districtUuid) return false;
    return scope.directDistrictUuids.has(districtUuid);
  }

  /** Construit la vue complète de réception (districts + membres + état). */
  private async buildView(
    edition_uuid: string,
    admin_uuid: string,
    scope?: UserScope,
  ) {
    await this.getAdmin(admin_uuid);
    const userScope = scope ?? (await this.resolveUserScope(admin_uuid));
    const edition = await this.editionRepo.findOne({
      where: { uuid: edition_uuid },
    });
    if (!edition) throw new NotFoundException('Édition introuvable');
    if (!edition.subscription_uuid) {
      throw new BadRequestException(
        "Cette édition n'est liée à aucune campagne d'abonnement.",
      );
    }

    // 1) Paiements payés de la campagne liée
    const payments = await this.subPaymentRepo.find({
      where: {
        subscription_uuid: edition.subscription_uuid,
        status: In([GlobalStatus.SUCCESS, GlobalStatus.COMPLETED]),
      },
    });

    // 2) Bénéficiaires → membres (par lots)
    const benUuids = Array.from(
      new Set(payments.map((p) => p.beneficiary_uuid).filter(Boolean)),
    );
    const memberMap = new Map<string, MemberEntity>();
    const chunkSize = 500;
    for (let i = 0; i < benUuids.length; i += chunkSize) {
      const chunk = benUuids.slice(i, i + chunkSize);
      const ms = await this.memberRepo.find({
        where: { uuid: In(chunk) },
        select: ['uuid', 'firstname', 'lastname', 'phone', 'structure_uuid'],
      });
      for (const m of ms) memberMap.set(m.uuid, m);
    }

    // 3) Quantité agrégée par membre (un membre = une ligne de réception)
    const qtyByMember = new Map<string, number>();
    for (const p of payments) {
      if (!memberMap.has(p.beneficiary_uuid)) continue;
      qtyByMember.set(
        p.beneficiary_uuid,
        (qtyByMember.get(p.beneficiary_uuid) ?? 0) + (p.quantity ?? 0),
      );
    }

    // 4) Chaînes de structure + niveau district
    const { levelName, districtLevelUuid, regionLevelUuid } =
      await this.loadLevels();
    const chains = await this.resolveChains(
      Array.from(memberMap.values())
        .map((m) => m.structure_uuid)
        .filter(Boolean) as string[],
      levelName,
    );

    // 5) État stocké
    const memberRecs = await this.memberRecRepo.find({ where: { edition_uuid } });
    const memberRecMap = new Map(
      memberRecs.map((r) => [r.member_uuid, r.received_at]),
    );
    const districtRecs = await this.districtRecRepo.find({
      where: { edition_uuid },
    });
    const districtRecMap = new Map(
      districtRecs.map((r) => [r.district_uuid, r]),
    );

    // 6) Regroupement par district
    const districtMap = new Map<
      string,
      {
        district_uuid: string | null;
        district_name: string;
        region: string | null;
        members: ReceptionMember[];
      }
    >();
    for (const [memberUuid, qty] of qtyByMember.entries()) {
      const m = memberMap.get(memberUuid)!;
      const chain = m.structure_uuid
        ? (chains.get(m.structure_uuid) ?? [])
        : [];
      // SÉCURITÉ (lecture) : ne conserver que les membres du périmètre de
      // l'utilisateur (sous-arbre de scopeRoot). Admin/national = tout.
      if (
        !userScope.all &&
        userScope.scopeRootUuid &&
        !chain.some((c) => c.uuid === userScope.scopeRootUuid)
      ) {
        continue;
      }
      // Utilisateur sans périmètre (ni admin, ni responsable) → ne voit rien.
      if (!userScope.all && !userScope.scopeRootUuid) {
        continue;
      }
      const districtNode = districtLevelUuid
        ? chain.find((c) => c.level_uuid === districtLevelUuid)
        : undefined;
      const regionNode = regionLevelUuid
        ? chain.find((c) => c.level_uuid === regionLevelUuid)
        : undefined;
      const key = districtNode?.uuid ?? NO_DISTRICT;
      if (!districtMap.has(key)) {
        districtMap.set(key, {
          district_uuid: districtNode?.uuid ?? null,
          district_name: districtNode?.name ?? 'Sans district',
          region: regionNode?.name ?? null,
          members: [],
        });
      }
      const receivedAt = memberRecMap.get(memberUuid) ?? null;
      districtMap.get(key)!.members.push({
        member_uuid: memberUuid,
        name:
          `${m.lastname ?? ''} ${m.firstname ?? ''}`.trim() || memberUuid,
        phone: m.phone ?? null,
        structure_path: chain.map((c) => ({
          level: c.level_name,
          name: c.name,
        })),
        quantity: qty,
        received: !!receivedAt,
        received_at: receivedAt,
      });
    }

    // 7) Responsables auto des districts
    const realDistrictUuids = Array.from(districtMap.values())
      .map((d) => d.district_uuid)
      .filter(Boolean) as string[];
    const responsibles = await this.resolveDistrictResponsibles(
      realDistrictUuids,
      districtLevelUuid,
      levelName,
    );

    // 8) Assemblage + statut
    const now = new Date();
    const deadline = edition.distribution_deadline_at
      ? new Date(edition.distribution_deadline_at)
      : null;

    const districts: ReceptionDistrict[] = Array.from(districtMap.values()).map(
      (d) => {
        const members = d.members.sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        const member_total = members.length;
        const member_received = members.filter((m) => m.received).length;
        const rec = d.district_uuid
          ? districtRecMap.get(d.district_uuid)
          : undefined;
        const lot_received = !!rec?.received_at;
        // responsable : stocké (validé) sinon auto-détecté
        const auto = d.district_uuid
          ? responsibles.get(d.district_uuid)
          : undefined;
        const responsible_name = rec?.responsible_name ?? auto?.name ?? null;
        const responsible_phone =
          rec?.responsible_phone ?? auto?.phone ?? null;
        let status: 'received' | 'pending' | 'late' = 'pending';
        if (lot_received) status = 'received';
        else if (deadline && now > deadline && member_total > 0)
          status = 'late';
        return {
          district_uuid: d.district_uuid,
          district_name: d.district_name,
          region: d.region,
          responsible_name,
          responsible_phone,
          member_total,
          member_received,
          reception_rate: member_total
            ? Math.round((member_received / member_total) * 1000) / 10
            : 0,
          lot_received,
          lot_received_at: rec?.received_at ?? null,
          status,
          can_validate: this.canValidateDistrict(userScope, d.district_uuid),
          members,
        };
      },
    );

    // « Sans district » en dernier, puis par nom
    districts.sort((a, b) => {
      if (!a.district_uuid && b.district_uuid) return 1;
      if (a.district_uuid && !b.district_uuid) return -1;
      return a.district_name.localeCompare(b.district_name);
    });

    const member_total = districts.reduce((s, d) => s + d.member_total, 0);
    const member_received = districts.reduce(
      (s, d) => s + d.member_received,
      0,
    );
    const districts_total = districts.length;
    const districts_received = districts.filter(
      (d) => d.status === 'received',
    ).length;
    const districts_late = districts.filter(
      (d) => d.status === 'late',
    ).length;

    return {
      edition: {
        uuid: edition.uuid,
        title: edition.title,
        number: edition.number,
        month: edition.month,
        year: edition.year,
        status: edition.status,
        // La distribution est « démarrée » quand status === 'started'.
        distribution_started: edition.status === GlobalStatus.STARTED,
        distribution_start_at: edition.distribution_start_at,
        distribution_deadline_at: edition.distribution_deadline_at,
      },
      scope: {
        all: userScope.all,
        level: userScope.scopeLevelName,
        can_validate_any:
          userScope.all || userScope.directDistrictUuids.size > 0,
      },
      summary: {
        districts_total,
        districts_received,
        districts_late,
        districts_pending: districts_total - districts_received - districts_late,
        member_total,
        member_received,
        member_pending: member_total - member_received,
        member_reception_rate: member_total
          ? Math.round((member_received / member_total) * 1000) / 10
          : 0,
        district_reception_rate: districts_total
          ? Math.round((districts_received / districts_total) * 1000) / 10
          : 0,
      },
      districts,
    };
  }

  /** Vue complète (cartes par district + membres). */
  async receptionByDistrict(edition_uuid: string, admin_uuid: string) {
    return this.buildView(edition_uuid, admin_uuid);
  }

  /** Statistiques (synthèse + agrégat par district, sans la liste des membres). */
  async receptionStats(edition_uuid: string, admin_uuid: string) {
    const view = await this.buildView(edition_uuid, admin_uuid);
    return {
      edition: view.edition,
      summary: view.summary,
      by_district: view.districts.map(({ members, ...rest }) => rest),
    };
  }

  /**
   * Tableau de bord ANALYTIQUE du suivi de distribution aux membres :
   *  - timeline : courbe cumulée des membres servis jour par jour ;
   *  - by_region : rollup par région ;
   *  - by_district : districts triés (retards d'abord) ;
   *  - by_responsible : suivi par responsable de district.
   */
  async receptionAnalytics(edition_uuid: string, admin_uuid: string) {
    const view = await this.buildView(edition_uuid, admin_uuid);
    const districts = view.districts;
    const round1 = (n: number) => Math.round(n * 10) / 10;

    // 1) Timeline cumulée (sur les received_at des membres servis)
    const dayCount = new Map<string, number>();
    for (const d of districts) {
      for (const m of d.members) {
        if (m.received && m.received_at) {
          const k = new Date(m.received_at).toISOString().slice(0, 10);
          dayCount.set(k, (dayCount.get(k) ?? 0) + 1);
        }
      }
    }
    let cumulative = 0;
    const timeline = Array.from(dayCount.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => {
        cumulative += count;
        return { date, count, cumulative };
      });

    // 2) Rollup par région
    const regionMap = new Map<
      string,
      {
        region: string;
        member_total: number;
        member_received: number;
        districts_total: number;
        districts_received: number;
        districts_late: number;
      }
    >();
    for (const d of districts) {
      const key = d.region || 'Sans région';
      if (!regionMap.has(key)) {
        regionMap.set(key, {
          region: key,
          member_total: 0,
          member_received: 0,
          districts_total: 0,
          districts_received: 0,
          districts_late: 0,
        });
      }
      const r = regionMap.get(key)!;
      r.member_total += d.member_total;
      r.member_received += d.member_received;
      r.districts_total += 1;
      if (d.status === 'received') r.districts_received += 1;
      if (d.status === 'late') r.districts_late += 1;
    }
    const by_region = Array.from(regionMap.values())
      .map((r) => ({
        ...r,
        member_pending: r.member_total - r.member_received,
        reception_rate: r.member_total
          ? round1((r.member_received / r.member_total) * 100)
          : 0,
      }))
      .sort((a, b) => b.reception_rate - a.reception_rate);

    // 3) Suivi par responsable de district
    const respMap = new Map<
      string,
      {
        responsible: string;
        phone: string | null;
        districts: number;
        districts_late: number;
        lots_received: number;
        member_total: number;
        member_received: number;
        district_names: string[];
      }
    >();
    for (const d of districts) {
      const key = d.responsible_name || 'Non défini';
      if (!respMap.has(key)) {
        respMap.set(key, {
          responsible: key,
          phone: d.responsible_phone ?? null,
          districts: 0,
          districts_late: 0,
          lots_received: 0,
          member_total: 0,
          member_received: 0,
          district_names: [],
        });
      }
      const r = respMap.get(key)!;
      r.districts += 1;
      if (d.status === 'late') r.districts_late += 1;
      if (d.lot_received) r.lots_received += 1;
      r.member_total += d.member_total;
      r.member_received += d.member_received;
      r.district_names.push(d.district_name);
    }
    const by_responsible = Array.from(respMap.values())
      .map((r) => ({
        ...r,
        member_pending: r.member_total - r.member_received,
        reception_rate: r.member_total
          ? round1((r.member_received / r.member_total) * 100)
          : 0,
      }))
      // les moins avancés d'abord (à relancer)
      .sort((a, b) => a.reception_rate - b.reception_rate);

    // 4) Districts triés (retards d'abord, puis taux croissant)
    const by_district = districts
      .map(({ members, ...rest }) => rest)
      .sort((a, b) => {
        const rank = (s: string) =>
          s === 'late' ? 0 : s === 'pending' ? 1 : 2;
        const r = rank(a.status) - rank(b.status);
        return r !== 0 ? r : a.reception_rate - b.reception_rate;
      });

    return {
      edition: view.edition,
      summary: view.summary,
      timeline,
      by_region,
      by_district,
      by_responsible,
    };
  }

  /**
   * ACTIONS PRIORITAIRES de l'utilisateur connecté (panneau dashboard).
   * Modèle self-service, par édition démarrée :
   *  - `lots`         : lots district à VALIDER (responsable direct / admin /
   *                     national), non encore réceptionnés → ils DISPARAISSENT
   *                     une fois validés ;
   *  - `my_reception` : la PROPRE réception de l'utilisateur (bénéficiaire),
   *                     tant qu'il ne l'a pas cochée ; `lot_received` indique
   *                     si le bouton est actif (le lot doit être reçu d'abord).
   */
  async getPriorityActions(admin_uuid: string) {
    const scope = await this.resolveUserScope(admin_uuid);

    const editions = await this.editionRepo.find({
      where: { status: GlobalStatus.STARTED },
      order: { distribution_start_at: 'DESC' },
      take: 8,
    });

    const { levelName, districtLevelUuid } = await this.loadLevels();

    // District du membre connecté (pour « ma réception »)
    let myDistrict: string | null = null;
    if (scope.memberUuid) {
      const me = await this.memberRepo.findOne({
        where: { uuid: scope.memberUuid },
        select: ['uuid', 'structure_uuid'],
      });
      if (me?.structure_uuid) {
        const chains = await this.resolveChains([me.structure_uuid], levelName);
        const chain = chains.get(me.structure_uuid) ?? [];
        myDistrict =
          (districtLevelUuid &&
            chain.find((c) => c.level_uuid === districtLevelUuid)?.uuid) ||
          null;
      }
    }

    // Le panneau reste TOUJOURS au niveau du district de l'utilisateur — même
    // pour un admin/national — pour ne pas alourdir la page. Un admin garde ses
    // droits plus larges ailleurs (page détail d'édition).
    const canValidateOwn =
      !!myDistrict &&
      (scope.all || scope.directDistrictUuids.has(myDistrict));
    // Scope restreint au seul district de l'utilisateur (lecture + validation).
    const panelScope: UserScope | null =
      canValidateOwn && myDistrict
        ? {
            all: false,
            scopeRootUuid: myDistrict,
            scopeLevelName: scope.scopeLevelName,
            directDistrictUuids: new Set<string>([myDistrict]),
            memberUuid: scope.memberUuid,
          }
        : null;

    const editionSummary = (ed: JournalEditionEntity) => ({
      uuid: ed.uuid,
      title: ed.title,
      number: ed.number,
      month: ed.month,
      year: ed.year,
      status: ed.status,
      distribution_started: ed.status === GlobalStatus.STARTED,
      distribution_start_at: ed.distribution_start_at,
      distribution_deadline_at: ed.distribution_deadline_at,
    });

    const out: any[] = [];
    let lots_pending = 0;
    let my_pending = 0;
    const rank = (s: string) => (s === 'late' ? 0 : s === 'pending' ? 1 : 2);

    for (const ed of editions) {
      // 1) LOTS à valider — UNIQUEMENT le district de l'utilisateur, non reçus.
      let lots: any[] = [];
      let editionObj: unknown = editionSummary(ed);
      if (panelScope) {
        const view = await this.buildView(ed.uuid, admin_uuid, panelScope).catch(
          () => null,
        );
        if (view) {
          editionObj = view.edition;
          lots = view.districts
            .filter(
              (d) =>
                d.district_uuid === myDistrict &&
                d.can_validate &&
                !d.lot_received,
            )
            .map((d) => ({
              district_uuid: d.district_uuid,
              district_name: d.district_name,
              region: d.region,
              status: d.status,
              member_total: d.member_total,
              member_received: d.member_received,
              member_pending: d.member_total - d.member_received,
            }))
            .sort((a, b) => rank(a.status) - rank(b.status));
        }
      }

      // 2) MA RÉCEPTION (self-service) — bénéficiaire pas encore coché.
      let my_reception: unknown = null;
      if (scope.memberUuid && ed.subscription_uuid && myDistrict) {
        const pays = await this.subPaymentRepo.find({
          where: {
            subscription_uuid: ed.subscription_uuid,
            beneficiary_uuid: scope.memberUuid,
            status: In([GlobalStatus.SUCCESS, GlobalStatus.COMPLETED]),
          },
        });
        const quantity = pays.reduce((s, p) => s + (p.quantity ?? 0), 0);
        if (pays.length && quantity > 0) {
          const rec = await this.memberRecRepo.findOne({
            where: { edition_uuid: ed.uuid, member_uuid: scope.memberUuid },
          });
          // déjà coché → on ne l'affiche plus (il disparaît)
          if (!rec?.received_at) {
            const lotRec = await this.districtRecRepo.findOne({
              where: { edition_uuid: ed.uuid, district_uuid: myDistrict },
            });
            const ds = await this.structureRepo.findOne({
              where: { uuid: myDistrict },
              select: ['uuid', 'name'],
            });
            my_reception = {
              member_uuid: scope.memberUuid,
              district_uuid: myDistrict,
              district_name: ds?.name ?? null,
              quantity,
              // bouton actif uniquement si le lot du district est réceptionné
              lot_received: !!lotRec?.received_at,
            };
            my_pending += 1;
          }
        }
      }

      lots_pending += lots.length;
      if (lots.length || my_reception) {
        out.push({ edition: editionObj, lots, my_reception });
      }
    }

    return {
      scope: {
        all: scope.all,
        level: scope.scopeLevelName,
        can_validate_any: canValidateOwn,
      },
      totals: {
        editions: out.length,
        lots_pending,
        my_pending,
      },
      editions: out,
    };
  }

  /** Valide (ou annule) la réception du LOT d'un district. */
  async validateDistrictLot(
    edition_uuid: string,
    district_uuid: string,
    admin_uuid: string,
    received: boolean,
    note?: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({
      where: { uuid: edition_uuid },
    });
    if (!edition) throw new NotFoundException('Édition introuvable');

    // La validation n'est possible que si la distribution est DÉMARRÉE.
    if (edition.status !== GlobalStatus.STARTED) {
      throw new BadRequestException(
        "La distribution de cette édition n'est pas encore démarrée.",
      );
    }

    // SÉCURITÉ : seul le responsable DIRECT du district (ou national/admin)
    // peut valider la réception de son lot.
    const scope = await this.resolveUserScope(admin_uuid);
    if (!this.canValidateDistrict(scope, district_uuid)) {
      throw new ForbiddenException(
        "Vous n'êtes pas autorisé à valider la réception de ce district.",
      );
    }

    const { districtLevelUuid, levelName } = await this.loadLevels();
    const responsibles = await this.resolveDistrictResponsibles(
      [district_uuid],
      districtLevelUuid,
      levelName,
    );
    let resp = responsibles.get(district_uuid) ?? null;
    // repli : validateur = utilisateur connecté
    if (!resp) {
      resp = {
        member_uuid: admin.member_uuid ?? '',
        name:
          `${admin.lastname ?? ''} ${admin.firstname ?? ''}`.trim() ||
          'Validateur',
        phone: null,
      };
    }

    const ds = await this.structureRepo.findOne({
      where: { uuid: district_uuid },
      select: ['uuid', 'name'],
    });

    let rec = await this.districtRecRepo.findOne({
      where: { edition_uuid, district_uuid },
    });
    if (!rec) {
      rec = this.districtRecRepo.create({
        edition_uuid,
        district_uuid,
        admin_uuid,
      });
    }
    rec.district_name = ds?.name ?? rec.district_name ?? null;
    rec.responsible_member_uuid = resp.member_uuid || null;
    rec.responsible_name = resp.name || null;
    rec.responsible_phone = resp.phone || null;
    rec.received_at = received ? new Date() : null;
    if (note !== undefined) rec.note = note;
    await this.districtRecRepo.save(rec);

    await this.logService.logAction(
      'journal-district-reception',
      admin.id,
      `Réception lot district "${rec.district_name}" (${received ? 'validée' : 'annulée'}) pour "${edition.title} N°${edition.number}"`,
    );

    return rec;
  }

  /** Valide (ou annule) la réception INDIVIDUELLE d'un membre. */
  async validateMemberReception(
    edition_uuid: string,
    member_uuid: string,
    admin_uuid: string,
    received: boolean,
    district_uuid?: string | null,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const edition = await this.editionRepo.findOne({
      where: { uuid: edition_uuid },
    });
    if (!edition) throw new NotFoundException('Édition introuvable');

    // La validation n'est possible que si la distribution est DÉMARRÉE.
    if (edition.status !== GlobalStatus.STARTED) {
      throw new BadRequestException(
        "La distribution de cette édition n'est pas encore démarrée.",
      );
    }

    // District RÉEL du membre (dérivé de sa structure) — sert de base à
    // l'autorisation. On NE fait PAS confiance au district fourni par le front
    // pour le contrôle de sécurité.
    let realDistrict: string | null = null;
    const m = await this.memberRepo.findOne({
      where: { uuid: member_uuid },
      select: ['uuid', 'structure_uuid'],
    });
    if (m?.structure_uuid) {
      const { levelName, districtLevelUuid } = await this.loadLevels();
      const chains = await this.resolveChains([m.structure_uuid], levelName);
      const chain = chains.get(m.structure_uuid) ?? [];
      realDistrict =
        (districtLevelUuid &&
          chain.find((c) => c.level_uuid === districtLevelUuid)?.uuid) ||
        null;
    }

    // SÉCURITÉ (self-service) : chaque membre marque UNIQUEMENT la réception de
    // son propre journal. Exception : admin / responsable national.
    const scope = await this.resolveUserScope(admin_uuid);
    const isSelf = !!scope.memberUuid && scope.memberUuid === member_uuid;
    if (!scope.all && !isSelf) {
      throw new ForbiddenException(
        'Chaque membre marque uniquement la réception de son propre journal.',
      );
    }

    // CONDITION : le lot du district doit avoir été réceptionné par le
    // responsable avant que le membre puisse marquer sa réception
    // (sauf admin / national).
    if (!scope.all) {
      const lotRec = realDistrict
        ? await this.districtRecRepo.findOne({
            where: { edition_uuid, district_uuid: realDistrict },
          })
        : null;
      if (!lotRec?.received_at) {
        throw new ForbiddenException(
          "Le lot de votre district n'a pas encore été réceptionné par le responsable du district.",
        );
      }
    }

    // District de rattachement stocké : celui fourni, sinon le district réel.
    const district = district_uuid ?? realDistrict;

    let rec = await this.memberRecRepo.findOne({
      where: { edition_uuid, member_uuid },
    });
    if (!rec) {
      rec = this.memberRecRepo.create({
        edition_uuid,
        member_uuid,
        admin_uuid,
      });
    }
    rec.district_uuid = district;
    rec.received_at = received ? new Date() : null;
    await this.memberRecRepo.save(rec);

    await this.logService.logAction(
      'journal-member-reception',
      admin.id,
      `Réception membre ${member_uuid} (${received ? 'validée' : 'annulée'}) pour "${edition.title} N°${edition.number}"`,
    );

    return rec;
  }
}
