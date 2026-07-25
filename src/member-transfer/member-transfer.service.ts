import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { MemberResponsibilityEntity } from 'src/member-responsibility/entities/member-responsibility.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import {
  CreateMemberTransferDto,
  ImpactPreviewDto,
} from './dto/create-member-transfer.dto';
import {
  ApproveMemberTransferDto,
  RejectMemberTransferDto,
} from './dto/decide-member-transfer.dto';
import { MemberTransferItemEntity } from './entities/member-transfer-item.entity';
import {
  MemberTransferEntity,
  TransferDirection,
  TransferMotif,
  TransferStatus,
} from './entities/member-transfer.entity';
import {
  DISTRICT_LEVEL_NAME,
  LEAF_LEVEL_NAMES,
  MemberImpact,
  ResponsibilityAnchorService,
  StructureIndex,
} from './responsibility-anchor.service';

/** Périmètre du demandeur, dérivé du JWT (cf. `buildPerimeter` dans structure.controller). */
export interface PerimeterContext {
  userUuid: string;
  userId?: number;
  isAdmin: boolean;
  allowedRootUuids: string[];
}

@Injectable()
export class MemberTransferService {
  constructor(
    @InjectRepository(MemberTransferEntity)
    private readonly transferRepository: Repository<MemberTransferEntity>,
    @InjectRepository(MemberTransferItemEntity)
    private readonly itemRepository: Repository<MemberTransferItemEntity>,
    @InjectRepository(MemberEntity)
    private readonly memberRepository: Repository<MemberEntity>,
    @InjectRepository(StructureEntity)
    private readonly structureRepository: Repository<StructureEntity>,
    private readonly anchorService: ResponsibilityAnchorService,
    private readonly logActivitiesService: LogActivitiesService,
    private readonly dataSource: DataSource,
  ) {}

  // ─────────────────────────────── Navigation hiérarchique ───────────────────────────────

  /**
   * Vérifie que `targetUuid` appartient au périmètre : l'une des racines autorisées, ou l'un
   * de leurs descendants. On remonte la chaîne parente du target — profondeur ≤ 8 paliers.
   *
   * ⚠️ **Même sémantique que `StructureTreeService.assertTargetWithinPerimeter`**, qui est
   * `private` et vit dans le module `structure` (référentiel lu, qu'on ne modifie pas depuis
   * le module `membres`). Réimplémenté ici sur l'index déjà chargé en mémoire, donc sans
   * requête supplémentaire. À factoriser dans un helper partagé lors du merge global.
   */
  private assertWithinPerimeter(
    index: StructureIndex,
    targetUuid: string,
    allowedRootUuids: string[],
    message = 'Structure hors de votre périmètre',
  ): void {
    const allowed = new Set(allowedRootUuids.filter(Boolean));
    // Aucun périmètre connu → on refuse plutôt que d'ouvrir tout l'arbre.
    if (allowed.size === 0) throw new ForbiddenException(message);

    let current: string | null = targetUuid;
    const seen = new Set<string>(); // garde anti-cycle (données héritées)

    while (current && !seen.has(current)) {
      if (allowed.has(current)) return;
      seen.add(current);
      const node = index.get(current);
      current =
        node?.parent_uuid && node.parent_uuid.trim() !== '' ? node.parent_uuid : null;
    }

    throw new ForbiddenException(message);
  }

  /** Sous-arbre (racines incluses) à partir de l'index en mémoire. */
  private subtreeUuids(index: StructureIndex, roots: string[]): Set<string> {
    const childrenByParent = new Map<string, string[]>();
    for (const node of index.values()) {
      const parent =
        node.parent_uuid && node.parent_uuid.trim() !== '' ? node.parent_uuid : null;
      if (!parent) continue;
      const bucket = childrenByParent.get(parent);
      if (bucket) bucket.push(node.uuid);
      else childrenByParent.set(parent, [node.uuid]);
    }

    const result = new Set<string>();
    const stack = [...roots];
    while (stack.length > 0) {
      const uuid = stack.pop() as string;
      if (result.has(uuid)) continue; // garde anti-cycle
      result.add(uuid);
      const kids = childrenByParent.get(uuid);
      if (kids) stack.push(...kids);
    }

    return result;
  }

  /**
   * Districts visibles par l'utilisateur. Sert à filtrer les listes de demandes : les colonnes
   * `source_district_uuid` / `target_district_uuid` portant toujours un district, on ne compare
   * qu'aux ~334 districts et jamais aux ~3500 structures du sous-arbre.
   */
  private async districtsWithinPerimeter(
    index: StructureIndex,
    ctx: PerimeterContext,
  ): Promise<string[] | null> {
    const districtLevelUuid = await this.anchorService.resolveLevelUuidByName(
      DISTRICT_LEVEL_NAME,
      index,
    );
    if (!districtLevelUuid) return [];
    // `null` = admin : aucun filtre.
    if (ctx.isAdmin) return null;

    const subtree = this.subtreeUuids(index, ctx.allowedRootUuids);
    const districts: string[] = [];
    for (const uuid of subtree) {
      if (index.get(uuid)?.level_uuid === districtLevelUuid) districts.push(uuid);
    }
    return districts;
  }

  // ─────────────────────────────── Validation d'une demande ───────────────────────────────

  /**
   * Charge les membres, résout leur district source et vérifie qu'il est unique.
   *
   * ⚠️ Exiger un **district source unique** est délibéré : la demande porte un contexte
   * (« ces membres quittent tel district »), et c'est ce district qui approuve dans le sens
   * ENTRANT. Des membres de districts différents = des demandes différentes.
   */
  private async resolveSourceContext(memberUuids: string[], index: StructureIndex) {
    const uniqueUuids = [...new Set(memberUuids)];

    const members = await this.memberRepository.find({
      where: { uuid: In(uniqueUuids) },
      select: ['uuid', 'firstname', 'lastname', 'matricule', 'structure_uuid', 'status'],
    });

    if (members.length !== uniqueUuids.length) {
      const found = new Set(members.map((m) => m.uuid));
      const missing = uniqueUuids.filter((u) => !found.has(u));
      throw new NotFoundException(
        `Membre(s) introuvable(s) : ${missing.join(', ')}`,
      );
    }

    const districtByMember = new Map<string, string>();
    const orphans: string[] = [];

    for (const member of members) {
      const district = member.structure_uuid
        ? await this.anchorService.resolveDistrict(member.structure_uuid, index)
        : null;
      if (!district) orphans.push(`${member.firstname} ${member.lastname}`);
      else districtByMember.set(member.uuid, district);
    }

    // Cas réel en base : des membres sont rattachés directement à un CHAPITRE, donc au-dessus
    // du district. Le workflow n'a alors pas de district source à faire approuver.
    if (orphans.length > 0) {
      throw new BadRequestException(
        `Rattachement incompatible avec un transfert de district pour : ${orphans.join(', ')}. ` +
          `Ces membres ne sont pas rattachés à une structure située dans un district — corrigez leur structure avant de les transférer.`,
      );
    }

    const districts = new Set(districtByMember.values());
    if (districts.size > 1) {
      throw new BadRequestException(
        'Les membres sélectionnés appartiennent à des districts différents. Créez une demande par district source.',
      );
    }

    return {
      members,
      sourceDistrictUuid: [...districts][0],
    };
  }

  /** Vérifie que la cible est bien une structure de niveau DISTRICT, non supprimée. */
  private async assertTargetIsDistrict(
    targetDistrictUuid: string,
    index: StructureIndex,
  ): Promise<void> {
    const districtLevelUuid = await this.anchorService.resolveLevelUuidByName(
      DISTRICT_LEVEL_NAME,
      index,
    );
    const node = index.get(targetDistrictUuid);

    if (!node) throw new NotFoundException('District de destination introuvable');
    if (node.level_uuid !== districtLevelUuid) {
      throw new BadRequestException(
        'La destination doit être une structure de niveau DISTRICT',
      );
    }
  }

  /** Règle R4 : un membre ne peut pas figurer dans deux demandes en attente. */
  private async assertNoPendingRequest(memberUuids: string[]): Promise<void> {
    const pending = await this.itemRepository
      .createQueryBuilder('i')
      .innerJoin(
        MemberTransferEntity,
        't',
        't.uuid = i.transfer_uuid AND t.deleted_at IS NULL',
      )
      .select(['i.member_uuid AS member_uuid'])
      .where('i.member_uuid IN (:...memberUuids)', { memberUuids })
      .andWhere('i.deleted_at IS NULL')
      .andWhere('t.status = :status', { status: TransferStatus.EN_ATTENTE })
      .getRawMany();

    if (pending.length > 0) {
      const uuids = [...new Set(pending.map((p) => p.member_uuid))];
      throw new ConflictException(
        `Une demande de transfert est déjà en attente pour ${uuids.length} membre(s) sélectionné(s).`,
      );
    }
  }

  // ─────────────────────────────── Aperçu d'impact ───────────────────────────────

  /**
   * Responsabilités perdues / conservées si les membres rejoignaient le district cible.
   *
   * Le district cible est utilisé comme destination pour le calcul d'ancre : c'est **exact**,
   * car les ancres de niveau CHAPITRE et au-dessus sont déjà déterminées par le district, et
   * celles de niveau DISTRICT / GROUPE / SOUS_GROUPE sont perdues quel que soit le placement
   * final (cf. `docs/TRANSFERT-MEMBRES.md` §5, règle R9).
   */
  async impactPreview(
    dto: ImpactPreviewDto,
    ctx: PerimeterContext,
  ): Promise<MemberImpact[]> {
    const index = await this.anchorService.loadStructureIndex();
    const { members, sourceDistrictUuid } = await this.resolveSourceContext(
      dto.member_uuids,
      index,
    );

    await this.assertTargetIsDistrict(dto.target_district_uuid, index);

    if (sourceDistrictUuid === dto.target_district_uuid) {
      throw new BadRequestException(
        "Le district de destination est identique au district d'origine : utilisez la modification de la fiche membre.",
      );
    }

    if (!ctx.isAdmin) {
      this.assertWithinPerimeter(
        index,
        sourceDistrictUuid,
        ctx.allowedRootUuids,
        "Le district d'origine est hors de votre périmètre",
      );
    }

    return this.anchorService.computeImpact(
      members.map((m) => ({
        member_uuid: m.uuid,
        from_structure_uuid: m.structure_uuid,
        to_structure_uuid: dto.target_district_uuid,
      })),
      index,
    );
  }

  // ─────────────────────────────── Création ───────────────────────────────

  async create(dto: CreateMemberTransferDto, ctx: PerimeterContext) {
    const index = await this.anchorService.loadStructureIndex();
    const { members, sourceDistrictUuid } = await this.resolveSourceContext(
      dto.member_uuids,
      index,
    );

    await this.assertTargetIsDistrict(dto.target_district_uuid, index);

    // R1 — même district ⇒ pas de workflow, c'est une édition simple.
    if (sourceDistrictUuid === dto.target_district_uuid) {
      throw new BadRequestException(
        "Le district de destination est identique au district d'origine : utilisez la modification de la fiche membre.",
      );
    }

    // R2 — l'initiateur doit avoir la source dans son périmètre.
    if (!ctx.isAdmin) {
      this.assertWithinPerimeter(
        index,
        sourceDistrictUuid,
        ctx.allowedRootUuids,
        "Le district d'origine est hors de votre périmètre",
      );
    }

    // R4 — pas de demande en attente sur ces membres.
    await this.assertNoPendingRequest(members.map((m) => m.uuid));

    const saved = await this.dataSource.transaction(async (manager) => {
      const transfer = manager.create(MemberTransferEntity, {
        direction: TransferDirection.SORTANT,
        status: TransferStatus.EN_ATTENTE,
        source_district_uuid: sourceDistrictUuid,
        target_district_uuid: dto.target_district_uuid,
        motif: dto.motif ?? TransferMotif.DEMENAGEMENT,
        comment: dto.comment ?? null,
        initiated_by_user_uuid: ctx.userUuid,
        initiated_at: new Date(),
        admin_uuid: ctx.userUuid,
      });
      const persisted = await manager.save(MemberTransferEntity, transfer);

      const items = members.map((member) =>
        manager.create(MemberTransferItemEntity, {
          transfer_uuid: persisted.uuid,
          member_uuid: member.uuid,
          from_structure_uuid: member.structure_uuid,
        }),
      );
      await manager.save(MemberTransferItemEntity, items);

      return persisted;
    });

    await this.logActivitiesService.logAction('member_transfer.created', ctx.userId, {
      transfer_uuid: saved.uuid,
      source_district_uuid: sourceDistrictUuid,
      target_district_uuid: dto.target_district_uuid,
      members: members.map((m) => m.uuid),
    });

    return this.findOne(saved.uuid, ctx);
  }

  // ─────────────────────────────── Consultation ───────────────────────────────

  private async paginate(
    districtColumn: 'source_district_uuid' | 'target_district_uuid',
    ctx: PerimeterContext,
    page: number,
    limit: number,
    status?: TransferStatus,
  ) {
    const index = await this.anchorService.loadStructureIndex();
    const districts = await this.districtsWithinPerimeter(index, ctx);

    const qb = this.transferRepository
      .createQueryBuilder('t')
      .where('t.deleted_at IS NULL')
      .orderBy('t.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (districts !== null) {
      if (districts.length === 0) {
        return { data: [], meta: buildPaginationMeta({ total: 0, page, perPage: limit }) };
      }
      qb.andWhere(`t.${districtColumn} IN (:...districts)`, { districts });
    }

    if (status) qb.andWhere('t.status = :status', { status });

    const [transfers, total] = await qb.getManyAndCount();
    const data = await this.decorate(transfers, index);

    return { data, meta: buildPaginationMeta({ total, page, perPage: limit }) };
  }

  /** Ajoute les noms de districts et le nombre de membres — ce qu'il faut pour une liste. */
  private async decorate(transfers: MemberTransferEntity[], index: StructureIndex) {
    if (transfers.length === 0) return [];

    const districtUuids = [
      ...new Set(
        transfers.flatMap((t) => [t.source_district_uuid, t.target_district_uuid]),
      ),
    ];
    const structures = await this.structureRepository.find({
      where: { uuid: In(districtUuids) },
      select: ['uuid', 'name'],
    });
    const nameByUuid = new Map(structures.map((s) => [s.uuid, s.name]));

    const counts = await this.itemRepository
      .createQueryBuilder('i')
      .select(['i.transfer_uuid AS transfer_uuid', 'COUNT(*) AS total'])
      .where('i.transfer_uuid IN (:...uuids)', { uuids: transfers.map((t) => t.uuid) })
      .andWhere('i.deleted_at IS NULL')
      .groupBy('i.transfer_uuid')
      .getRawMany();
    const countByTransfer = new Map(
      counts.map((c) => [c.transfer_uuid, Number(c.total)]),
    );

    return transfers.map((t) => ({
      ...t,
      source_district_name: nameByUuid.get(t.source_district_uuid) ?? null,
      target_district_name: nameByUuid.get(t.target_district_uuid) ?? null,
      members_count: countByTransfer.get(t.uuid) ?? 0,
    }));
  }

  /** Demandes à traiter : celles dont le district cible est dans mon périmètre. */
  listIncoming(ctx: PerimeterContext, page = 1, limit = 15, status?: TransferStatus) {
    return this.paginate('target_district_uuid', ctx, page, limit, status);
  }

  /** Demandes parties de mon périmètre. */
  listOutgoing(ctx: PerimeterContext, page = 1, limit = 15, status?: TransferStatus) {
    return this.paginate('source_district_uuid', ctx, page, limit, status);
  }

  async findOne(uuid: string, ctx: PerimeterContext) {
    const transfer = await this.transferRepository.findOne({ where: { uuid } });
    if (!transfer) throw new NotFoundException('Demande de transfert introuvable');

    const index = await this.anchorService.loadStructureIndex();

    // Visible si la source OU la cible est dans mon périmètre.
    if (!ctx.isAdmin) {
      const visible = [
        transfer.source_district_uuid,
        transfer.target_district_uuid,
      ].some((district) => {
        try {
          this.assertWithinPerimeter(index, district, ctx.allowedRootUuids);
          return true;
        } catch {
          return false;
        }
      });
      if (!visible) {
        throw new ForbiddenException('Cette demande est hors de votre périmètre');
      }
    }

    const [decorated] = await this.decorate([transfer], index);
    const items = await this.loadItems(transfer, index);

    return { ...decorated, items };
  }

  /** Lignes de la demande, enrichies (membre, structures) et impact recalculé. */
  private async loadItems(transfer: MemberTransferEntity, index: StructureIndex) {
    const rows = await this.itemRepository
      .createQueryBuilder('i')
      .leftJoin('members', 'm', 'm.uuid = i.member_uuid')
      .leftJoin('structures', 'sf', 'sf.uuid = i.from_structure_uuid')
      .leftJoin('structures', 'st', 'st.uuid = i.to_structure_uuid')
      .select([
        'i.uuid AS uuid',
        'i.member_uuid AS member_uuid',
        'i.from_structure_uuid AS from_structure_uuid',
        'i.to_structure_uuid AS to_structure_uuid',
        'i.lost_responsibility_uuids AS lost_responsibility_uuids',
        'i.applied_at AS applied_at',
        'm.firstname AS firstname',
        'm.lastname AS lastname',
        'm.matricule AS matricule',
        'm.structure_uuid AS current_structure_uuid',
        'sf.name AS from_structure_name',
        'st.name AS to_structure_name',
      ])
      .where('i.transfer_uuid = :uuid', { uuid: transfer.uuid })
      .andWhere('i.deleted_at IS NULL')
      .getRawMany();

    // L'impact n'a de sens que tant que la demande est ouverte : après application, il est figé
    // dans `lost_responsibility_uuids`.
    if (transfer.status !== TransferStatus.EN_ATTENTE) return rows;

    const impacts = await this.anchorService.computeImpact(
      rows.map((r) => ({
        member_uuid: r.member_uuid,
        from_structure_uuid: r.from_structure_uuid,
        to_structure_uuid: transfer.target_district_uuid,
      })),
      index,
    );
    const impactByMember = new Map(impacts.map((i) => [i.member_uuid, i]));

    return rows.map((r) => ({
      ...r,
      // R5 : signale une ligne devenue obsolète avant même la décision.
      has_moved: r.current_structure_uuid !== r.from_structure_uuid,
      impact: impactByMember.get(r.member_uuid) ?? null,
    }));
  }

  /** Historique de mobilité d'un membre — toutes ses lignes de transfert, récentes d'abord. */
  async memberHistory(memberUuid: string) {
    return this.itemRepository
      .createQueryBuilder('i')
      .innerJoin(MemberTransferEntity, 't', 't.uuid = i.transfer_uuid')
      .leftJoin('structures', 'sf', 'sf.uuid = i.from_structure_uuid')
      .leftJoin('structures', 'st', 'st.uuid = i.to_structure_uuid')
      .leftJoin('structures', 'ds', 'ds.uuid = t.source_district_uuid')
      .leftJoin('structures', 'dt', 'dt.uuid = t.target_district_uuid')
      .select([
        'i.uuid AS uuid',
        'i.from_structure_uuid AS from_structure_uuid',
        'i.to_structure_uuid AS to_structure_uuid',
        'i.lost_responsibility_uuids AS lost_responsibility_uuids',
        'i.applied_at AS applied_at',
        'sf.name AS from_structure_name',
        'st.name AS to_structure_name',
        't.uuid AS transfer_uuid',
        't.status AS status',
        't.motif AS motif',
        't.decision_comment AS decision_comment',
        't.created_at AS created_at',
        't.decided_at AS decided_at',
        'ds.name AS source_district_name',
        'dt.name AS target_district_name',
      ])
      .where('i.member_uuid = :memberUuid', { memberUuid })
      .andWhere('i.deleted_at IS NULL')
      .orderBy('i.created_at', 'DESC')
      .getRawMany();
  }

  // ─────────────────────────────── Décisions ───────────────────────────────

  private async loadPending(uuid: string): Promise<MemberTransferEntity> {
    const transfer = await this.transferRepository.findOne({ where: { uuid } });
    if (!transfer) throw new NotFoundException('Demande de transfert introuvable');
    if (transfer.status !== TransferStatus.EN_ATTENTE) {
      throw new ConflictException(
        `Cette demande n'est plus en attente (statut : ${transfer.status}).`,
      );
    }
    return transfer;
  }

  /**
   * Approbation + application, en une transaction.
   *
   * L'approbateur fixe la structure d'accueil de chaque membre. Tout se joue ici :
   * contrôle de périmètre (R3), anti-écrasement (R5), application de la règle d'ancre (R8).
   */
  async approve(uuid: string, dto: ApproveMemberTransferDto, ctx: PerimeterContext) {
    const transfer = await this.loadPending(uuid);
    const index = await this.anchorService.loadStructureIndex();

    // R3 — l'approbateur doit avoir le district cible dans son périmètre.
    if (!ctx.isAdmin) {
      this.assertWithinPerimeter(
        index,
        transfer.target_district_uuid,
        ctx.allowedRootUuids,
        "Le district de destination est hors de votre périmètre : vous ne pouvez pas approuver cette demande",
      );
    }

    const items = await this.itemRepository.find({
      where: { transfer_uuid: transfer.uuid },
    });
    if (items.length === 0) {
      throw new ConflictException('Cette demande ne contient aucun membre');
    }

    // Un placement, et un seul, par membre de la demande.
    const placementByMember = new Map(
      dto.placements.map((p) => [p.member_uuid, p.structure_uuid]),
    );
    const missing = items.filter((i) => !placementByMember.has(i.member_uuid));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Structure d'accueil manquante pour ${missing.length} membre(s) de la demande.`,
      );
    }

    // Les structures d'accueil doivent être des feuilles DU district cible.
    await this.assertPlacementsValid(
      [...placementByMember.values()],
      transfer.target_district_uuid,
      index,
    );

    // R5 — le membre a-t-il bougé depuis la demande ? Vérifié AVANT la transaction pour
    // pouvoir marquer la demande OBSOLETE (un throw dans la transaction annulerait ce marquage).
    const members = await this.memberRepository.find({
      where: { uuid: In(items.map((i) => i.member_uuid)) },
      select: ['uuid', 'firstname', 'lastname', 'structure_uuid'],
    });
    const memberByUuid = new Map(members.map((m) => [m.uuid, m]));
    const moved = items.filter(
      (i) => memberByUuid.get(i.member_uuid)?.structure_uuid !== i.from_structure_uuid,
    );
    if (moved.length > 0) {
      await this.transferRepository.update(
        { uuid: transfer.uuid },
        { status: TransferStatus.OBSOLETE },
      );
      throw new ConflictException(
        `La structure de ${moved.length} membre(s) a changé depuis la demande : celle-ci est devenue obsolète. Créez une nouvelle demande.`,
      );
    }

    const impacts = await this.anchorService.computeImpact(
      items.map((i) => ({
        member_uuid: i.member_uuid,
        from_structure_uuid: i.from_structure_uuid,
        to_structure_uuid: placementByMember.get(i.member_uuid) as string,
      })),
      index,
    );
    const impactByMember = new Map(impacts.map((i) => [i.member_uuid, i]));

    await this.dataSource.transaction(async (manager) => {
      // Relecture verrouillée : deux approbateurs simultanés ne peuvent pas appliquer deux fois.
      const locked = await manager.findOne(MemberTransferEntity, {
        where: { uuid: transfer.uuid },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked || locked.status !== TransferStatus.EN_ATTENTE) {
        throw new ConflictException("Cette demande vient d'être traitée par ailleurs.");
      }

      const now = new Date();

      for (const item of items) {
        const toStructureUuid = placementByMember.get(item.member_uuid) as string;
        const impact = impactByMember.get(item.member_uuid);
        const lost = impact?.lost ?? [];

        // R8 — les responsabilités dont l'ancre a changé sont retirées.
        if (lost.length > 0) {
          await manager.softDelete(MemberResponsibilityEntity, {
            uuid: In(lost.map((l) => l.member_responsibility_uuid)),
          });
        }

        await manager.update(
          MemberEntity,
          { uuid: item.member_uuid },
          { structure_uuid: toStructureUuid },
        );

        await manager.update(
          MemberTransferItemEntity,
          { uuid: item.uuid },
          {
            to_structure_uuid: toStructureUuid,
            lost_responsibility_uuids: lost.map((l) => l.responsibility_uuid),
            applied_at: now,
          },
        );
      }

      await manager.update(
        MemberTransferEntity,
        { uuid: transfer.uuid },
        {
          status: TransferStatus.APPROUVEE,
          decided_by_user_uuid: ctx.userUuid,
          decided_at: now,
          decision_comment: dto.comment ?? null,
        },
      );
    });

    await this.logActivitiesService.logAction('member_transfer.approved', ctx.userId, {
      transfer_uuid: transfer.uuid,
      target_district_uuid: transfer.target_district_uuid,
      placements: Object.fromEntries(placementByMember),
      lost_responsibilities: Object.fromEntries(
        impacts.map((i) => [i.member_uuid, i.lost.map((l) => l.responsibility_uuid)]),
      ),
    });

    return this.findOne(transfer.uuid, ctx);
  }

  /** La structure d'accueil doit être une feuille (GROUPE / SOUS_GROUPE) du district cible. */
  private async assertPlacementsValid(
    structureUuids: string[],
    targetDistrictUuid: string,
    index: StructureIndex,
  ): Promise<void> {
    const leafLevelUuids = new Set(
      (
        await Promise.all(
          LEAF_LEVEL_NAMES.map((name) =>
            this.anchorService.resolveLevelUuidByName(name, index),
          )
        )
      ).filter((uuid): uuid is string => !!uuid),
    );

    const districtSubtree = this.subtreeUuids(index, [targetDistrictUuid]);

    for (const uuid of new Set(structureUuids)) {
      const node = index.get(uuid);
      if (!node) {
        throw new NotFoundException(`Structure d'accueil introuvable : ${uuid}`);
      }
      if (!districtSubtree.has(uuid)) {
        throw new BadRequestException(
          "La structure d'accueil choisie n'appartient pas au district de destination.",
        );
      }
      if (!node.level_uuid || !leafLevelUuids.has(node.level_uuid)) {
        throw new BadRequestException(
          "La structure d'accueil doit être un groupe ou un sous-groupe.",
        );
      }
    }
  }

  async reject(uuid: string, dto: RejectMemberTransferDto, ctx: PerimeterContext) {
    const transfer = await this.loadPending(uuid);
    const index = await this.anchorService.loadStructureIndex();

    if (!ctx.isAdmin) {
      this.assertWithinPerimeter(
        index,
        transfer.target_district_uuid,
        ctx.allowedRootUuids,
        "Le district de destination est hors de votre périmètre : vous ne pouvez pas refuser cette demande",
      );
    }

    await this.transferRepository.update(
      { uuid: transfer.uuid },
      {
        status: TransferStatus.REFUSEE,
        decided_by_user_uuid: ctx.userUuid,
        decided_at: new Date(),
        decision_comment: dto.comment,
      },
    );

    await this.logActivitiesService.logAction('member_transfer.rejected', ctx.userId, {
      transfer_uuid: transfer.uuid,
      comment: dto.comment,
    });

    return this.findOne(transfer.uuid, ctx);
  }

  /** Annulation par l'initiateur (ou un admin) tant que la demande est en attente. */
  async cancel(uuid: string, ctx: PerimeterContext) {
    const transfer = await this.loadPending(uuid);

    if (!ctx.isAdmin && transfer.initiated_by_user_uuid !== ctx.userUuid) {
      throw new ForbiddenException(
        "Seul l'initiateur de la demande peut l'annuler.",
      );
    }

    await this.transferRepository.update(
      { uuid: transfer.uuid },
      {
        status: TransferStatus.ANNULEE,
        decided_by_user_uuid: ctx.userUuid,
        decided_at: new Date(),
      },
    );

    await this.logActivitiesService.logAction('member_transfer.cancelled', ctx.userId, {
      transfer_uuid: transfer.uuid,
    });

    return this.findOne(transfer.uuid, ctx);
  }
}
