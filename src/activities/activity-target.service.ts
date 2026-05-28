import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ActivityEntity,
  ActivityTargetGender,
  ActivityTargetScope,
} from './entities/activity.entity';
import {
  ActivityParticipantEntity,
  ActivityParticipantRole,
} from './entities/activity-participant.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { StructureService } from 'src/structure/structure.service';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { ResolveTargetsDto } from './dto/resolve-targets.dto';

export interface ResolvedCriteria {
  scope: ActivityTargetScope;
  structures: string[];
  levels: string[];
  responsibilities: string[];
  responsibility_levels: string[];
  include_descendants: boolean;
  gender: ActivityTargetGender | null;
}

@Injectable()
export class ActivityTargetService {
  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepo: Repository<ActivityEntity>,
    @InjectRepository(ActivityParticipantEntity)
    private readonly participantRepo: Repository<ActivityParticipantEntity>,
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,
    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly logService: LogActivitiesService,
    private readonly structureService: StructureService,
  ) {}

  private async getAdmin(uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    return admin;
  }

  private safeArray(json: string | null | undefined): string[] {
    if (!json) return [];
    try {
      const v = JSON.parse(json);
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  /**
   * Fusionne les critères stockés sur l'activité avec un override éventuel
   * fourni par l'appelant (utile pour preview ad hoc).
   */
  private merge(
    activity: ActivityEntity | null,
    override?: ResolveTargetsDto,
  ): ResolvedCriteria {
    return {
      scope:
        override?.target_scope ??
        activity?.target_scope ??
        ActivityTargetScope.ALL_MEMBERS,
      structures:
        override?.target_structures ??
        this.safeArray(activity?.target_structures ?? null),
      levels:
        override?.target_levels ??
        this.safeArray(activity?.target_levels ?? null),
      responsibilities:
        override?.target_responsibilities ??
        this.safeArray(activity?.target_responsibilities ?? null),
      responsibility_levels:
        override?.target_responsibility_levels ??
        this.safeArray(activity?.target_responsibility_levels ?? null),
      include_descendants:
        override?.include_descendants ?? activity?.include_descendants ?? false,
      gender: override?.target_gender ?? activity?.target_gender ?? null,
    };
  }

  /**
   * Étend une liste de structures à toutes leurs descendances via SQL récursif,
   * en s'appuyant sur la même logique CTE que StructureService.findByAllChildrens
   * (mais ici sans filtrer par order=7).
   */
  private async expandDescendants(structureUuids: string[]): Promise<string[]> {
    if (!structureUuids.length) return [];

    const sql = `
      WITH RECURSIVE tree AS (
        SELECT s.id, s.uuid, s.parent_id
        FROM structures s
        WHERE s.uuid IN (?)

        UNION ALL

        SELECT c.id, c.uuid, c.parent_id
        FROM structures c
        JOIN tree t ON c.parent_id = t.id
      )
      SELECT DISTINCT uuid FROM tree
    `;
    const rows = await this.structureRepo.query(sql, [structureUuids]);
    return rows.map((r: any) => r.uuid as string);
  }

  /**
   * Résout les critères en :
   *  - liste des structures effectivement ciblées (après expansion)
   *  - liste des membres uniques correspondant à tout le ciblage
   */
  async resolve(
    activity_uuid: string | null,
    override: ResolveTargetsDto | undefined,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);

    let activity: ActivityEntity | null = null;
    if (activity_uuid) {
      activity = await this.activityRepo.findOne({
        where: { uuid: activity_uuid },
      });
      if (!activity) throw new NotFoundException('Activité introuvable');
    }

    const c = this.merge(activity, override);

    // 1) Étendre les structures avec leurs niveaux ciblés
    let structureScope = [...c.structures];

    if (c.levels.length) {
      const fromLevels = await this.structureRepo.find({
        where: { level_uuid: In(c.levels) },
        select: ['uuid'],
      });
      structureScope.push(...fromLevels.map((s) => s.uuid));
    }

    if (c.include_descendants && structureScope.length) {
      structureScope = await this.expandDescendants(structureScope);
    } else {
      structureScope = Array.from(new Set(structureScope));
    }

    // 2) Construire la requête membres
    const qb = this.memberRepo
      .createQueryBuilder('m')
      .leftJoin('m.structure', 's')
      .leftJoin('s.level', 'sl')
      .where('m.deleted_at IS NULL');

    if (structureScope.length) {
      qb.andWhere('m.structure_uuid IN (:...structs)', {
        structs: structureScope,
      });
    }

    if (c.gender) {
      qb.andWhere('m.gender = :g', { g: c.gender });
    }

    const wantsResponsables =
      c.scope === ActivityTargetScope.RESPONSABLES_ONLY ||
      c.scope === ActivityTargetScope.MIXED ||
      c.responsibilities.length > 0 ||
      c.responsibility_levels.length > 0;

    if (wantsResponsables) {
      // INNER JOIN pour responsables uniquement, LEFT JOIN sinon
      const joinKind =
        c.scope === ActivityTargetScope.RESPONSABLES_ONLY ? 'innerJoin' : 'leftJoin';
      qb[joinKind](
        'member_responsibilities',
        'mr',
        'mr.member_id = m.id AND mr.deleted_at IS NULL',
      );
      qb[joinKind](
        'responsibilities',
        'r',
        'r.id = mr.responsibility_id AND r.deleted_at IS NULL',
      );

      if (c.responsibilities.length) {
        qb.andWhere('r.uuid IN (:...resps)', {
          resps: c.responsibilities,
        });
      }
      if (c.responsibility_levels.length) {
        qb.andWhere('r.level_uuid IN (:...rlevels)', {
          rlevels: c.responsibility_levels,
        });
      }
    }

    qb.select([
      'm.uuid AS uuid',
      'm.firstname AS firstname',
      'm.lastname AS lastname',
      'm.gender AS gender',
      'm.phone AS phone',
      'm.phone_whatsapp AS phone_whatsapp',
      'm.structure_uuid AS structure_uuid',
      's.name AS structure_name',
      'sl.name AS level_name',
    ])
      .groupBy('m.uuid')
      .orderBy('m.lastname', 'ASC');

    const rows = await qb.getRawMany();

    await this.logService.logAction(
      'activity-targets-resolve',
      admin.id,
      `Résolution cibles activité=${activity_uuid ?? 'ad-hoc'} → ${rows.length} membres`,
    );

    return {
      activity_uuid: activity?.uuid ?? null,
      criteria: c,
      resolved_structures_count: structureScope.length,
      resolved_structures: structureScope,
      total: rows.length,
      members: rows,
    };
  }

  /**
   * Aperçu : retourne le compte + un échantillon (200 premiers).
   */
  async preview(
    activity_uuid: string | null,
    override: ResolveTargetsDto | undefined,
    admin_uuid: string,
  ) {
    const result = await this.resolve(activity_uuid, override, admin_uuid);
    return {
      activity_uuid: result.activity_uuid,
      criteria: result.criteria,
      total: result.total,
      resolved_structures_count: result.resolved_structures_count,
      sample: result.members.slice(0, 200),
    };
  }

  /**
   * Auto-assignation : résout les cibles puis crée les participants manquants
   * dans une seule transaction logique (idempotent — on saute les déjà inscrits).
   */
  async autoAssign(
    activity_uuid: string,
    override: ResolveTargetsDto | undefined,
    role: ActivityParticipantRole,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({
      where: { uuid: activity_uuid },
    });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const resolved = await this.resolve(activity_uuid, override, admin_uuid);
    const memberUuids: string[] = resolved.members.map((m: any) => m.uuid);

    if (!memberUuids.length) {
      return {
        activity_uuid,
        added: 0,
        already_assigned: 0,
        total_resolved: 0,
      };
    }

    const existing = await this.participantRepo.find({
      where: { activity_uuid, member_uuid: In(memberUuids) },
      select: ['member_uuid'],
    });
    const existingSet = new Set(existing.map((e) => e.member_uuid));

    const toCreate = resolved.members
      .filter((m: any) => !existingSet.has(m.uuid))
      .map((m: any) =>
        this.participantRepo.create({
          activity_uuid,
          member_uuid: m.uuid,
          role,
          structure_uuid_at_invitation: m.structure_uuid ?? null,
          admin_uuid,
        }),
      );

    const saved = toCreate.length
      ? await this.participantRepo.save(toCreate)
      : [];

    await this.logService.logAction(
      'activity-targets-auto-assign',
      admin.id,
      `Auto-assignation activité "${activity.name}" : ${saved.length} ajoutés / ${existingSet.size} déjà inscrits / ${memberUuids.length} cibles`,
    );

    return {
      activity_uuid,
      total_resolved: memberUuids.length,
      added: saved.length,
      already_assigned: existingSet.size,
    };
  }
}
