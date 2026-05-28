import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  ActivityParticipantEntity,
  ActivityParticipantRole,
} from './entities/activity-participant.entity';
import { ActivityEntity } from './entities/activity.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { AssignParticipantsDto } from './dto/assign-participants.dto';

@Injectable()
export class ActivityParticipantService {
  constructor(
    @InjectRepository(ActivityParticipantEntity)
    private readonly participantRepo: Repository<ActivityParticipantEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepo: Repository<ActivityEntity>,
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

  async list(activity_uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({
      where: { uuid: activity_uuid },
    });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const items = await this.participantRepo.find({
      where: { activity_uuid },
      relations: ['member'],
      order: { created_at: 'ASC' },
    });
    await this.logService.logAction(
      'activity-participants-list',
      admin.id,
      `Liste des participants de "${activity.name}"`,
    );
    return items;
  }

  async assign(
    activity_uuid: string,
    payload: AssignParticipantsDto,
    admin_uuid: string,
  ) {
    if (!payload?.member_uuids?.length) {
      throw new BadRequestException('Veuillez fournir au moins un membre.');
    }
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({
      where: { uuid: activity_uuid },
    });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const members = await this.memberRepo.find({
      where: { uuid: In(payload.member_uuids) },
    });
    if (members.length !== payload.member_uuids.length) {
      throw new BadRequestException(
        'Un ou plusieurs membres sont introuvables.',
      );
    }

    const existing = await this.participantRepo.find({
      where: {
        activity_uuid,
        member_uuid: In(payload.member_uuids),
      },
    });
    const existingSet = new Set(existing.map((e) => e.member_uuid));

    const toCreate = members
      .filter((m) => !existingSet.has(m.uuid))
      .map((m) =>
        this.participantRepo.create({
          activity_uuid,
          member_uuid: m.uuid,
          role: payload.role ?? ActivityParticipantRole.PARTICIPANT,
          structure_uuid_at_invitation: m.structure_uuid ?? null,
          admin_uuid,
        }),
      );

    const saved = toCreate.length
      ? await this.participantRepo.save(toCreate)
      : [];

    await this.logService.logAction(
      'activity-participants-assign',
      admin.id,
      `Assignation de ${saved.length} membre(s) à "${activity.name}" (${existing.length} déjà inscrits)`,
    );

    return {
      activity_uuid,
      added: saved.length,
      already_assigned: existing.length,
      participants: saved,
    };
  }

  async remove(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const participant = await this.participantRepo.findOne({
      where: { uuid },
      relations: ['activity', 'member'],
    });
    if (!participant) throw new NotFoundException('Participant introuvable');

    await this.logService.logAction(
      'activity-participant-remove',
      admin.id,
      `Retrait du participant ${participant.member?.firstname} ${participant.member?.lastname} de "${participant.activity?.name}"`,
    );
    return await this.participantRepo.softRemove(participant);
  }

  async changeRole(
    uuid: string,
    role: ActivityParticipantRole,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const participant = await this.participantRepo.findOne({ where: { uuid } });
    if (!participant) throw new NotFoundException('Participant introuvable');

    const allowed = Object.values(ActivityParticipantRole);
    if (!allowed.includes(role)) {
      throw new BadRequestException(
        `Rôle invalide. Valeurs autorisées : ${allowed.join(', ')}`,
      );
    }
    participant.role = role;
    const updated = await this.participantRepo.save(participant);
    await this.logService.logAction(
      'activity-participant-change-role',
      admin.id,
      `Rôle du participant ${participant.member_uuid} → ${role}`,
    );
    return updated;
  }
}
