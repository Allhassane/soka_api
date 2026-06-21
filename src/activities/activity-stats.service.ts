import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ActivityEntity } from './entities/activity.entity';
import { ActivityParticipantEntity } from './entities/activity-participant.entity';
import { ActivityAttendanceEntity } from './entities/activity-attendance.entity';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { StructureService } from 'src/structure/structure.service';

@Injectable()
export class ActivityStatsService {
  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepo: Repository<ActivityEntity>,
    @InjectRepository(ActivityParticipantEntity)
    private readonly participantRepo: Repository<ActivityParticipantEntity>,
    @InjectRepository(ActivityAttendanceEntity)
    private readonly attendanceRepo: Repository<ActivityAttendanceEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly logService: LogActivitiesService,
    private readonly structureService: StructureService,
  ) {}

  private async getAdmin(uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");
    return admin;
  }

  /** Stats d'une activité : participation, présence, taux par structure */
  async forActivity(activity_uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({
      where: { uuid: activity_uuid },
    });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const participants = await this.participantRepo.find({
      where: { activity_uuid },
      relations: ['member', 'member.structure'],
    });
    const attendances = await this.attendanceRepo.find({
      where: { activity_uuid, present: true },
    });
    const presentSet = new Set(attendances.map((a) => a.member_uuid));

    const total = participants.length;
    const present = participants.filter((p) =>
      presentSet.has(p.member_uuid),
    ).length;
    const rate = total ? Math.round((present / total) * 1000) / 10 : 0;

    // Par structure
    const byStructure = new Map<string, any>();
    for (const p of participants) {
      const key = p.member?.structure?.name ?? 'Sans structure';
      if (!byStructure.has(key)) {
        byStructure.set(key, { structure: key, total: 0, present: 0 });
      }
      const s = byStructure.get(key);
      s.total += 1;
      if (presentSet.has(p.member_uuid)) s.present += 1;
    }
    const by_structure = Array.from(byStructure.values()).map((s) => ({
      ...s,
      rate: s.total ? Math.round((s.present / s.total) * 1000) / 10 : 0,
    }));

    // Par rôle
    const byRole = new Map<string, any>();
    for (const p of participants) {
      const key = p.role;
      if (!byRole.has(key)) {
        byRole.set(key, { role: key, total: 0, present: 0 });
      }
      const r = byRole.get(key);
      r.total += 1;
      if (presentSet.has(p.member_uuid)) r.present += 1;
    }
    const by_role = Array.from(byRole.values()).map((r) => ({
      ...r,
      rate: r.total ? Math.round((r.present / r.total) * 1000) / 10 : 0,
    }));

    await this.logService.logAction(
      'activity-stats-one',
      admin.id,
      `Stats activité "${activity.name}"`,
    );

    return {
      activity: {
        uuid: activity.uuid,
        name: activity.name,
        starts_at: activity.starts_at,
        ends_at: activity.ends_at,
        status: activity.status,
      },
      total_participants: total,
      total_present: present,
      total_absent: total - present,
      attendance_rate: rate,
      by_structure,
      by_role,
    };
  }

  /**
   * Dashboard du responsable connecté : périmètre = sous-arbre structure du
   * responsable (cf. StructureService.findByAllChildrens).
   */
  async dashboard(admin_uuid: string, structure_uuid?: string) {
    const admin = await this.getAdmin(admin_uuid);

    let scopeStructures: string[] | null = null;
    if (structure_uuid) {
      scopeStructures = await this.structureService.findByAllChildrens(
        structure_uuid,
      );
    }

    // Activités du périmètre
    const qb = this.activityRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.structure', 's');
    if (scopeStructures && scopeStructures.length) {
      qb.where('a.structure_uuid IN (:...uuids)', { uuids: scopeStructures });
    }
    const activities = await qb.orderBy('a.starts_at', 'DESC').getMany();

    const activityUuids = activities.map((a) => a.uuid);

    let participantsCount = 0;
    let presentCount = 0;
    if (activityUuids.length) {
      participantsCount = await this.participantRepo.count({
        where: { activity_uuid: In(activityUuids) },
      });
      presentCount = await this.attendanceRepo.count({
        where: { activity_uuid: In(activityUuids), present: true },
      });
    }

    const upcoming = activities
      .filter((a) => new Date(a.starts_at) > new Date())
      .slice(0, 10)
      .map((a) => ({
        uuid: a.uuid,
        name: a.name,
        starts_at: a.starts_at,
        location: a.location,
        status: a.status,
      }));

    // Top 5 activités par participation
    const participations = await this.participantRepo
      .createQueryBuilder('p')
      .select('p.activity_uuid', 'activity_uuid')
      .addSelect('COUNT(*)', 'count')
      .where(activityUuids.length ? 'p.activity_uuid IN (:...uuids)' : '1=1', {
        uuids: activityUuids.length ? activityUuids : [''],
      })
      .groupBy('p.activity_uuid')
      .orderBy('count', 'DESC')
      .limit(5)
      .getRawMany();
    const actMap = new Map(activities.map((a) => [a.uuid, a]));
    const top_activities = participations.map((p) => ({
      activity_uuid: p.activity_uuid,
      name: actMap.get(p.activity_uuid)?.name ?? '-',
      participants: Number(p.count),
    }));

    await this.logService.logAction(
      'activity-stats-dashboard',
      admin.id,
      `Dashboard activités${structure_uuid ? ` (structure=${structure_uuid})` : ''}`,
    );

    return {
      scope: structure_uuid ?? null,
      total_activities: activities.length,
      upcoming_count: upcoming.length,
      total_participants: participantsCount,
      total_present: presentCount,
      attendance_rate: participantsCount
        ? Math.round((presentCount / participantsCount) * 1000) / 10
        : 0,
      upcoming,
      top_activities,
    };
  }
}
