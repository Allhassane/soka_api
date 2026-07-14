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
import { ActivityQuotaService } from './activity-quota.service';

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
    private readonly quotaService: ActivityQuotaService,
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
    const hasMembers = (payload.member_uuids?.length ?? 0) > 0;
    const hasGuests = (payload.guests?.length ?? 0) > 0;

    if (!hasMembers && !hasGuests) {
      throw new BadRequestException(
        'Veuillez fournir au moins un membre ou un invité.',
      );
    }

    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({
      where: { uuid: activity_uuid },
    });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const toCreate: ActivityParticipantEntity[] = [];
    const toRestore: ActivityParticipantEntity[] = [];
    let alreadyAssigned = 0;

    if (hasMembers) {
      const members = await this.memberRepo.find({
        where: { uuid: In(payload.member_uuids!) },
      });
      if (members.length !== payload.member_uuids!.length) {
        throw new BadRequestException(
          'Un ou plusieurs membres sont introuvables.',
        );
      }

      // withDeleted: la contrainte unique (activity_uuid, member_uuid) porte sur la
      // ligne physique même soft-supprimée -> un participant décoché puis recoché
      // doit être RÉACTIVÉ, pas réinséré (sinon violation de contrainte unique).
      const existing = await this.participantRepo.find({
        where: {
          activity_uuid,
          member_uuid: In(payload.member_uuids!),
        },
        withDeleted: true,
      });
      const activeExisting = existing.filter((e) => !e.deleted_at);
      const softDeletedExisting = existing.filter((e) => !!e.deleted_at);
      alreadyAssigned = activeExisting.length;
      const handledUuids = new Set(existing.map((e) => e.member_uuid));

      if (softDeletedExisting.length) {
        // restore() est la seule façon fiable de remettre deleted_at à NULL en base
        // (un save() avec deleted_at=undefined n'y touche pas, TypeORM l'ignorerait).
        await this.participantRepo.restore(
          softDeletedExisting.map((p) => p.id),
        );
        softDeletedExisting.forEach((p) => {
          const member = members.find((m) => m.uuid === p.member_uuid);
          p.deleted_at = undefined;
          p.role = payload.role ?? ActivityParticipantRole.PARTICIPANT;
          p.structure_uuid_at_invitation =
            member?.structure_uuid ?? p.structure_uuid_at_invitation;
          p.admin_uuid = admin_uuid;
          toRestore.push(p);
        });
      }

      members
        .filter((m) => !handledUuids.has(m.uuid))
        .forEach((m) =>
          toCreate.push(
            this.participantRepo.create({
              activity_uuid,
              member_uuid: m.uuid,
              role: payload.role ?? ActivityParticipantRole.PARTICIPANT,
              structure_uuid_at_invitation: m.structure_uuid ?? null,
              admin_uuid,
            }),
          ),
        );
    }

    if (hasGuests) {
      for (const guest of payload.guests!) {
        const guestMember = this.memberRepo.create({
          firstname: guest.firstname,
          lastname: guest.lastname,
          ...(guest.phone ? { phone: guest.phone } : {}),
          gender: guest.gender,
          admin_uuid,
          status: 'guest',
        });
        const savedGuest = await this.memberRepo.save(guestMember);
        toCreate.push(
          this.participantRepo.create({
            activity_uuid,
            member_uuid: savedGuest.uuid,
            role: ActivityParticipantRole.INVITE,
            structure_uuid_at_invitation: null,
            admin_uuid,
          }),
        );
      }
    }

    const saved = toCreate.length
      ? await this.participantRepo.save(toCreate)
      : [];
    const restored = toRestore.length
      ? await this.participantRepo.save(toRestore)
      : [];
    const allSaved = [...saved, ...restored];

    for (const p of allSaved) {
      await this.quotaService.adjustUsedForMemberStructure(
        activity_uuid,
        p.structure_uuid_at_invitation,
        1,
      );
    }

    await this.logService.logAction(
      'activity-participants-assign',
      admin.id,
      `Assignation de ${allSaved.length} participant(s) à "${activity.name}" (${alreadyAssigned} déjà inscrits)`,
    );

    return {
      activity_uuid,
      added: allSaved.length,
      already_assigned: alreadyAssigned,
      participants: allSaved,
    };
  }

  async remove(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const participant = await this.participantRepo.findOne({
      where: { uuid },
      relations: ['activity', 'member'],
    });
    if (!participant) throw new NotFoundException('Participant introuvable');

    await this.quotaService.adjustUsedForMemberStructure(
      participant.activity_uuid,
      participant.structure_uuid_at_invitation ?? participant.member?.structure_uuid,
      -1,
    );

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
