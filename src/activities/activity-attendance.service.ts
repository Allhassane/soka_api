import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityAttendanceEntity } from './entities/activity-attendance.entity';
import { ActivityEntity } from './entities/activity.entity';
import { ActivityParticipantEntity } from './entities/activity-participant.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import {
  BulkMarkAttendanceDto,
  MarkAttendanceDto,
} from './dto/mark-attendance.dto';

@Injectable()
export class ActivityAttendanceService {
  constructor(
    @InjectRepository(ActivityAttendanceEntity)
    private readonly attendanceRepo: Repository<ActivityAttendanceEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepo: Repository<ActivityEntity>,
    @InjectRepository(ActivityParticipantEntity)
    private readonly participantRepo: Repository<ActivityParticipantEntity>,
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,
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

  /**
   * Listing de présence : retourne la fusion participants × attendance.
   * Inclut donc les inscrits non encore pointés (present=false, arrived_at=null).
   */
  async listing(activity_uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({
      where: { uuid: activity_uuid },
    });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const participants = await this.participantRepo.find({
      where: { activity_uuid },
      relations: ['member', 'member.structure'],
      order: { created_at: 'ASC' },
    });

    const attendances = await this.attendanceRepo.find({
      where: { activity_uuid },
    });
    const attMap = new Map(attendances.map((a) => [a.member_uuid, a]));

    const rows = participants.map((p) => {
      const a = attMap.get(p.member_uuid);
      return {
        participant_uuid: p.uuid,
        member_uuid: p.member_uuid,
        member_name: p.member
          ? `${p.member.firstname} ${p.member.lastname}`
          : null,
        role: p.role,
        structure_name: p.member?.structure?.name ?? null,
        present: a?.present ?? false,
        arrived_at: a?.arrived_at ?? null,
        comment: a?.comment ?? null,
        attendance_uuid: a?.uuid ?? null,
      };
    });

    await this.logService.logAction(
      'activity-attendance-listing',
      admin.id,
      `Feuille de présence "${activity.name}"`,
    );

    return {
      activity: {
        uuid: activity.uuid,
        name: activity.name,
        starts_at: activity.starts_at,
        ends_at: activity.ends_at,
      },
      total: rows.length,
      present_count: rows.filter((r) => r.present).length,
      absent_count: rows.filter((r) => !r.present).length,
      rows,
    };
  }

  async mark(
    activity_uuid: string,
    payload: MarkAttendanceDto,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({
      where: { uuid: activity_uuid },
    });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const member = await this.memberRepo.findOne({
      where: { uuid: payload.member_uuid },
    });
    if (!member) throw new NotFoundException('Membre introuvable');

    let attendance = await this.attendanceRepo.findOne({
      where: { activity_uuid, member_uuid: payload.member_uuid },
    });

    if (!attendance) {
      attendance = this.attendanceRepo.create({
        activity_uuid,
        member_uuid: payload.member_uuid,
        present: payload.present,
        arrived_at:
          payload.arrived_at ?? (payload.present ? new Date() : null),
        comment: payload.comment ?? null,
        marked_by_admin_uuid: admin_uuid,
      });
    } else {
      attendance.present = payload.present;
      attendance.arrived_at =
        payload.arrived_at ??
        (payload.present ? attendance.arrived_at ?? new Date() : null);
      attendance.comment = payload.comment ?? attendance.comment;
      attendance.marked_by_admin_uuid = admin_uuid;
    }

    const saved = await this.attendanceRepo.save(attendance);
    await this.logService.logAction(
      'activity-attendance-mark',
      admin.id,
      `Présence ${payload.present ? 'OK' : 'NON'} pour ${member.firstname} ${member.lastname} à "${activity.name}"`,
    );
    return saved;
  }

  async markBulk(
    activity_uuid: string,
    payload: BulkMarkAttendanceDto,
    admin_uuid: string,
  ) {
    if (!payload?.items?.length) {
      throw new BadRequestException('Aucun marquage à enregistrer.');
    }
    const results: any[] = [];
    for (const item of payload.items) {
      const r = await this.mark(activity_uuid, item, admin_uuid);
      results.push(r);
    }
    return { saved: results.length, items: results };
  }
}
