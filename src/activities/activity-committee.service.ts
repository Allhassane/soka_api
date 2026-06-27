import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityCommitteeEntity } from './entities/activity-committee.entity';
import { ActivityCommitteeMemberEntity, CommitteeMemberRole } from './entities/activity-committee-member.entity';
import { ActivityEntity } from './entities/activity.entity';
import { MemberEntity } from 'src/members/entities/member.entity';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import {
  CreateActivityCommitteeDto,
  UpdateActivityCommitteeDto,
} from './dto/create-activity-committee.dto';
import {
  CreateActivityCommitteeMemberDto,
  UpdateActivityCommitteeMemberDto,
} from './dto/create-activity-committee-member.dto';

@Injectable()
export class ActivityCommitteeService {
  constructor(
    @InjectRepository(ActivityCommitteeEntity)
    private readonly committeeRepo: Repository<ActivityCommitteeEntity>,
    @InjectRepository(ActivityCommitteeMemberEntity)
    private readonly cmemberRepo: Repository<ActivityCommitteeMemberEntity>,
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
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");
    return admin;
  }

  // ---- COMMITTEES ----

  async listCommittees(activity_uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({ where: { uuid: activity_uuid } });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const items = await this.committeeRepo.find({
      where: { activity_uuid },
      relations: ['members', 'members.member'],
      order: { created_at: 'ASC' },
    });
    await this.logService.logAction(
      'activity-committees-list',
      admin.id,
      `Liste comités activité "${activity.name}"`,
    );
    return items;
  }

  async findOneCommittee(uuid: string, admin_uuid: string) {
    await this.getAdmin(admin_uuid);
    const committee = await this.committeeRepo.findOne({
      where: { uuid },
      relations: ['members', 'members.member'],
    });
    if (!committee) throw new NotFoundException('Comité introuvable');
    return committee;
  }

  async createCommittee(
    activity_uuid: string,
    payload: CreateActivityCommitteeDto,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({ where: { uuid: activity_uuid } });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const committee = this.committeeRepo.create({
      activity_uuid,
      name: payload.name,
      description: payload.description ?? null,
      status: 'active',
      admin_uuid,
    });
    const saved = await this.committeeRepo.save(committee);
    await this.logService.logAction(
      'activity-committee-create',
      admin.id,
      `Comité "${payload.name}" créé pour activité "${activity.name}"`,
    );
    return saved;
  }

  async updateCommittee(uuid: string, payload: UpdateActivityCommitteeDto, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const committee = await this.committeeRepo.findOne({ where: { uuid } });
    if (!committee) throw new NotFoundException('Comité introuvable');

    if (payload.name !== undefined) committee.name = payload.name;
    if (payload.description !== undefined) committee.description = payload.description ?? null;
    if (payload.status !== undefined) committee.status = payload.status;

    const updated = await this.committeeRepo.save(committee);
    await this.logService.logAction(
      'activity-committee-update',
      admin.id,
      `Comité uuid=${uuid} mis à jour`,
    );
    return updated;
  }

  async deleteCommittee(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const committee = await this.committeeRepo.findOne({ where: { uuid } });
    if (!committee) throw new NotFoundException('Comité introuvable');
    await this.logService.logAction(
      'activity-committee-delete',
      admin.id,
      `Suppression comité uuid=${uuid}`,
    );
    return await this.committeeRepo.softRemove(committee);
  }

  // ---- COMMITTEE MEMBERS ----

  async listCommitteeMembers(committee_uuid: string, admin_uuid: string) {
    await this.getAdmin(admin_uuid);
    const committee = await this.committeeRepo.findOne({ where: { uuid: committee_uuid } });
    if (!committee) throw new NotFoundException('Comité introuvable');

    return this.cmemberRepo.find({
      where: { committee_uuid },
      relations: ['member'],
      order: { role: 'ASC', created_at: 'ASC' },
    });
  }

  async addCommitteeMember(
    committee_uuid: string,
    payload: CreateActivityCommitteeMemberDto,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const committee = await this.committeeRepo.findOne({ where: { uuid: committee_uuid } });
    if (!committee) throw new NotFoundException('Comité introuvable');

    const member = await this.memberRepo.findOne({ where: { uuid: payload.member_uuid } });
    if (!member) throw new NotFoundException('Membre introuvable');

    const existing = await this.cmemberRepo.findOne({
      where: { committee_uuid, member_uuid: payload.member_uuid },
    });
    if (existing) {
      throw new ConflictException('Ce membre est déjà dans ce comité');
    }

    if (payload.role === CommitteeMemberRole.PRESIDENT) {
      const currentPresident = await this.cmemberRepo.findOne({
        where: { committee_uuid, role: CommitteeMemberRole.PRESIDENT },
      });
      if (currentPresident) {
        throw new BadRequestException('Ce comité a déjà un président');
      }
    }

    const cm = this.cmemberRepo.create({
      committee_uuid,
      member_uuid: payload.member_uuid,
      role: payload.role ?? CommitteeMemberRole.MEMBRE,
      commission: payload.commission ?? null,
      admin_uuid,
    });
    const saved = await this.cmemberRepo.save(cm);
    await this.logService.logAction(
      'activity-committee-member-add',
      admin.id,
      `Membre ${member.firstname} ${member.lastname} ajouté au comité "${committee.name}"`,
    );
    return saved;
  }

  async updateCommitteeMember(
    uuid: string,
    payload: UpdateActivityCommitteeMemberDto,
    admin_uuid: string,
  ) {
    const admin = await this.getAdmin(admin_uuid);
    const cm = await this.cmemberRepo.findOne({ where: { uuid } });
    if (!cm) throw new NotFoundException('Membre du comité introuvable');

    if (payload.role === CommitteeMemberRole.PRESIDENT) {
      const currentPresident = await this.cmemberRepo.findOne({
        where: { committee_uuid: cm.committee_uuid, role: CommitteeMemberRole.PRESIDENT },
      });
      if (currentPresident && currentPresident.uuid !== uuid) {
        throw new BadRequestException('Ce comité a déjà un président');
      }
    }

    if (payload.role !== undefined) cm.role = payload.role;
    if (payload.commission !== undefined) cm.commission = payload.commission ?? null;

    const updated = await this.cmemberRepo.save(cm);
    await this.logService.logAction(
      'activity-committee-member-update',
      admin.id,
      `Membre comité uuid=${uuid} mis à jour`,
    );
    return updated;
  }

  async removeCommitteeMember(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const cm = await this.cmemberRepo.findOne({ where: { uuid }, relations: ['member'] });
    if (!cm) throw new NotFoundException('Membre du comité introuvable');
    await this.logService.logAction(
      'activity-committee-member-remove',
      admin.id,
      `Retrait membre comité uuid=${uuid}`,
    );
    return await this.cmemberRepo.softRemove(cm);
  }
}
