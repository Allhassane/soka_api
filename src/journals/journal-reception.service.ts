import {
  BadRequestException,
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
  members: ReceptionMember[];
};

const NO_DISTRICT = '__none__';

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
  ): Promise<
    Map<string, { member_uuid: string; name: string; phone: string | null }>
  > {
    const out = new Map<
      string,
      { member_uuid: string; name: string; phone: string | null }
    >();
    const ids = Array.from(new Set(districtUuids.filter(Boolean)));
    if (!ids.length) return out;

    // Membres positionnés exactement au district (mono-table members)
    const members = await this.memberRepo.find({
      where: { structure_uuid: In(ids) },
      select: ['uuid', 'firstname', 'lastname', 'phone', 'structure_uuid'],
    });
    if (!members.length) return out;

    const memberUuids = members.map((m) => m.uuid);
    // Responsabilités de ces membres (member_responsibilities ⨝ responsibilities,
    // toutes deux utf8mb4 → JOIN interne sûr ; pas de JOIN vers members).
    const placeholders = memberUuids.map(() => '?').join(',');
    const respRows: {
      member_uuid: string;
      level_uuid: string | null;
    }[] = await this.structureRepo.manager.query(
      `SELECT mr.member_uuid AS member_uuid, r.level_uuid AS level_uuid
       FROM member_responsibilities mr
       INNER JOIN responsibilities r
         ON r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL
       WHERE mr.deleted_at IS NULL AND mr.member_uuid IN (${placeholders})`,
      memberUuids,
    );
    const respByMember = new Map<string, string | null>();
    for (const r of respRows) {
      // priorité à une responsabilité de niveau district
      if (
        !respByMember.has(r.member_uuid) ||
        (districtLevelUuid && r.level_uuid === districtLevelUuid)
      ) {
        respByMember.set(r.member_uuid, r.level_uuid ?? null);
      }
    }

    // Sélection d'un responsable par district
    const byDistrict = new Map<string, MemberEntity[]>();
    for (const m of members) {
      const d = m.structure_uuid!;
      if (!byDistrict.has(d)) byDistrict.set(d, []);
      byDistrict.get(d)!.push(m);
    }
    for (const [district, list] of byDistrict.entries()) {
      const score = (m: MemberEntity) => {
        if (!respByMember.has(m.uuid)) return 0; // pas de responsabilité
        return districtLevelUuid && respByMember.get(m.uuid) === districtLevelUuid
          ? 2 // responsabilité de niveau district
          : 1; // autre responsabilité
      };
      const best = list.slice().sort((a, b) => score(b) - score(a))[0];
      if (best && score(best) > 0) {
        out.set(district, {
          member_uuid: best.uuid,
          name: `${best.lastname ?? ''} ${best.firstname ?? ''}`.trim(),
          phone: best.phone ?? null,
        });
      }
    }
    return out;
  }

  /** Construit la vue complète de réception (districts + membres + état). */
  private async buildView(edition_uuid: string, admin_uuid: string) {
    await this.getAdmin(admin_uuid);
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
        distribution_start_at: edition.distribution_start_at,
        distribution_deadline_at: edition.distribution_deadline_at,
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

    const { districtLevelUuid } = await this.loadLevels();
    const responsibles = await this.resolveDistrictResponsibles(
      [district_uuid],
      districtLevelUuid,
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

    // District de rattachement (fourni par le front, sinon dérivé)
    let district = district_uuid ?? null;
    if (!district) {
      const m = await this.memberRepo.findOne({
        where: { uuid: member_uuid },
        select: ['uuid', 'structure_uuid'],
      });
      if (m?.structure_uuid) {
        const { levelName, districtLevelUuid } = await this.loadLevels();
        const chains = await this.resolveChains(
          [m.structure_uuid],
          levelName,
        );
        const chain = chains.get(m.structure_uuid) ?? [];
        district =
          (districtLevelUuid &&
            chain.find((c) => c.level_uuid === districtLevelUuid)?.uuid) ||
          null;
      }
    }

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
