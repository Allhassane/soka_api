import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityQuotaEntity } from './entities/activity-quota.entity';
import { ActivityEntity } from './entities/activity.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { CreateActivityQuotaDto, UpdateActivityQuotaDto } from './dto/create-activity-quota.dto';

@Injectable()
export class ActivityQuotaService {
  constructor(
    @InjectRepository(ActivityQuotaEntity)
    private readonly quotaRepo: Repository<ActivityQuotaEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepo: Repository<ActivityEntity>,
    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly logService: LogActivitiesService,
  ) {}

  private async getAdmin(uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");
    return admin;
  }

  async list(activity_uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({ where: { uuid: activity_uuid } });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const items = await this.quotaRepo.find({
      where: { activity_uuid },
      relations: ['structure'],
      order: { created_at: 'ASC' },
    });
    await this.logService.logAction(
      'activity-quotas-list',
      admin.id,
      `Liste quotas activité "${activity.name}"`,
    );
    return items;
  }

  async create(activity_uuid: string, payload: CreateActivityQuotaDto, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({ where: { uuid: activity_uuid } });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const structure = await this.structureRepo.findOne({ where: { uuid: payload.structure_uuid } });
    if (!structure) throw new NotFoundException('Structure introuvable');

    const existing = await this.quotaRepo.findOne({
      where: { activity_uuid, structure_uuid: payload.structure_uuid },
    });
    if (existing) {
      throw new ConflictException('Un quota existe déjà pour cette structure dans cette activité');
    }

    const quota = this.quotaRepo.create({
      activity_uuid,
      structure_uuid: payload.structure_uuid,
      quota_allocated: payload.quota_allocated,
      quota_used: 0,
      admin_uuid,
    });
    const saved = await this.quotaRepo.save(quota);
    await this.logService.logAction(
      'activity-quota-create',
      admin.id,
      `Quota ${payload.quota_allocated} créé pour structure "${structure.name}" sur activité "${activity.name}"`,
    );
    return saved;
  }

  async update(uuid: string, payload: UpdateActivityQuotaDto, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const quota = await this.quotaRepo.findOne({ where: { uuid }, relations: ['activity'] });
    if (!quota) throw new NotFoundException('Quota introuvable');

    if (payload.quota_allocated !== undefined) quota.quota_allocated = payload.quota_allocated;
    if (payload.quota_used !== undefined) {
      if (payload.quota_used > quota.quota_allocated) {
        throw new BadRequestException('Le quota utilisé ne peut pas dépasser le quota alloué');
      }
      quota.quota_used = payload.quota_used;
    }
    const updated = await this.quotaRepo.save(quota);
    await this.logService.logAction(
      'activity-quota-update',
      admin.id,
      `Quota mis à jour uuid=${uuid}`,
    );
    return updated;
  }

  async remove(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const quota = await this.quotaRepo.findOne({ where: { uuid } });
    if (!quota) throw new NotFoundException('Quota introuvable');
    await this.logService.logAction('activity-quota-delete', admin.id, `Suppression quota uuid=${uuid}`);
    return await this.quotaRepo.softRemove(quota);
  }

  async summary(activity_uuid: string, admin_uuid: string) {
    await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({ where: { uuid: activity_uuid } });
    if (!activity) throw new NotFoundException('Activité introuvable');

    const quotas = await this.quotaRepo.find({
      where: { activity_uuid },
      relations: ['structure'],
    });
    const total_allocated = quotas.reduce((s, q) => s + q.quota_allocated, 0);
    const total_used = quotas.reduce((s, q) => s + q.quota_used, 0);
    return {
      activity_uuid,
      total_allocated,
      total_used,
      remaining: total_allocated - total_used,
      by_structure: quotas.map((q) => ({
        uuid: q.uuid,
        structure_uuid: q.structure_uuid,
        structure_name: (q.structure as any)?.name ?? null,
        quota_allocated: q.quota_allocated,
        quota_used: q.quota_used,
        remaining: q.quota_allocated - q.quota_used,
      })),
    };
  }
}
