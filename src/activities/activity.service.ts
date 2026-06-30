import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityEntity } from './entities/activity.entity';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { FilterActivitiesDto } from './dto/filter-activities.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityEntity)
    private readonly activityRepo: Repository<ActivityEntity>,
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

  async findAll(admin_uuid: string, filter?: FilterActivitiesDto) {
    const admin = await this.getAdmin(admin_uuid);
    const f = filter ?? ({} as FilterActivitiesDto);

    const qb = this.activityRepo
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.structure', 's')
      .leftJoinAndSelect('a.activityType', 'at')
      .leftJoin('s.level', 'sl');

    if (f.search) {
      qb.andWhere('(a.name LIKE :q OR a.description LIKE :q)', { q: '%' + f.search + '%' });
    }
    if (f.type) qb.andWhere('a.type = :type', { type: f.type });
    if (f.status) qb.andWhere('a.status = :status', { status: f.status });
    if (f.structure_uuid) qb.andWhere('a.structure_uuid = :su', { su: f.structure_uuid });
    if (f.structures && f.structures.length) qb.andWhere('a.structure_uuid IN (:...sl)', { sl: f.structures });
    if (f.level_uuid) qb.andWhere('sl.uuid = :lvlUuid', { lvlUuid: f.level_uuid });
    if (f.member_uuid) {
      qb.andWhere((qb2) => {
        const sub = qb2
          .subQuery()
          .select('p.activity_uuid')
          .from('activity_participants', 'p')
          .where('p.member_uuid = :muuid AND p.deleted_at IS NULL')
          .getQuery();
        return 'a.uuid IN ' + sub;
      }).setParameter('muuid', f.member_uuid);
    }
    if (f.from) qb.andWhere('a.starts_at >= :from', { from: f.from });
    if (f.to) qb.andWhere('a.starts_at <= :to', { to: f.to });
    const now = new Date();
    if (toBool(f.upcoming)) qb.andWhere('a.starts_at > :now', { now });
    if (toBool(f.past)) qb.andWhere('a.ends_at < :now', { now });

    const orderBy = ['starts_at', 'created_at', 'name'].includes(f.order_by ?? '')
      ? (f.order_by as string)
      : 'starts_at';
    const orderDir = (f.order_dir ?? 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    qb.orderBy('a.' + orderBy, orderDir as 'ASC' | 'DESC');
    qb.take(f.limit ?? 50).skip(f.offset ?? 0);

    const [items, total] = await qb.getManyAndCount();

    await this.logService.logAction(
      'activities-findAll',
      admin.id,
      'Liste activites filtres total=' + total,
    );

    return {
      total,
      count: items.length,
      limit: f.limit ?? 50,
      offset: f.offset ?? 0,
      items: items.map((a) => decodeActivity(a)),
    };
  }

  async findOne(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({
      where: { uuid },
      relations: ['structure', 'activityType', 'participants', 'participants.member'],
    });
    if (!activity) throw new NotFoundException('Aucune activite trouvee');
    await this.logService.logAction(
      'activities-findOne',
      admin.id,
      'Consultation activite ' + activity.name,
    );
    return decodeActivity(activity);
  }

  async store(payload: CreateActivityDto, admin_uuid: string) {
    if (!payload?.name || !payload?.starts_at || !payload?.ends_at) {
      throw new BadRequestException('Veuillez renseigner tous les champs obligatoires.');
    }
    if (new Date(payload.ends_at) <= new Date(payload.starts_at)) {
      throw new BadRequestException('La date de fin doit etre posterieure a la date de debut.');
    }
    const admin = await this.getAdmin(admin_uuid);

    const history = {
      action: 'Creation activite',
      table_action: 'activity-store',
      performed_by: admin.firstname + ' ' + admin.lastname,
      data: payload,
      admin_uuid,
      performed_at: new Date(),
    };

    const activity = this.activityRepo.create({
      name: payload.name,
      description: payload.description ?? null,
      type: payload.type ?? null,
      activity_type_uuid: payload.activity_type_uuid ?? null,
      location: payload.location ?? null,
      starts_at: payload.starts_at,
      ends_at: payload.ends_at,
      capacity: payload.capacity ?? null,
      quota_per_centre: payload.quota_per_centre ?? null,
      is_recurring: payload.is_recurring ?? false,
      recurrence_rule: payload.recurrence_rule ?? null,
      structure_uuid: payload.structure_uuid ?? null,
      organigram: payload.organigram ? JSON.stringify(payload.organigram) : null,
      target_scope: payload.target_scope ?? undefined,
      target_structures: payload.target_structures ? JSON.stringify(payload.target_structures) : null,
      target_levels: payload.target_levels ? JSON.stringify(payload.target_levels) : null,
      target_responsibilities: payload.target_responsibilities ? JSON.stringify(payload.target_responsibilities) : null,
      target_responsibility_levels: payload.target_responsibility_levels ? JSON.stringify(payload.target_responsibility_levels) : null,
      target_departments: payload.target_departments ? JSON.stringify(payload.target_departments) : null,
      include_descendants: payload.include_descendants ?? false,
      target_gender: payload.target_gender ?? null,
      admin_uuid,
      status: GlobalStatus.CREATED,
      history: JSON.stringify([history]),
    });

    const saved = await this.activityRepo.save(activity);
    await this.logService.logAction(
      'activity-store',
      admin.id,
      'Creation activite ' + saved.name + ' par ' + admin.firstname + ' ' + admin.lastname,
    );
    return decodeActivity(saved);
  }

  async update(uuid: string, payload: UpdateActivityDto, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({ where: { uuid } });
    if (!activity) throw new NotFoundException('Activite introuvable');

    const merged: any = { ...payload };
    if (merged.organigram) {
      activity.organigram = JSON.stringify(merged.organigram);
      delete merged.organigram;
    }
    const jsonFields = ['target_structures', 'target_levels', 'target_responsibilities', 'target_responsibility_levels', 'target_departments'] as const;
    for (const jsonField of jsonFields) {
      if (merged[jsonField] !== undefined) {
        (activity as any)[jsonField] = merged[jsonField] ? JSON.stringify(merged[jsonField]) : null;
        delete merged[jsonField];
      }
    }
    Object.assign(activity, { ...merged, admin_uuid, updated_at: new Date() });

    if (activity.starts_at && activity.ends_at && new Date(activity.ends_at) <= new Date(activity.starts_at)) {
      throw new BadRequestException('La date de fin doit etre posterieure a la date de debut.');
    }

    const entry = {
      action: 'MAJ activite',
      table_action: 'activity-update',
      performed_by: admin.firstname + ' ' + admin.lastname,
      data: payload,
      admin_uuid,
      performed_at: new Date(),
    };
    let arr: any[] = [];
    if (activity.history) {
      try {
        arr = JSON.parse(activity.history);
        if (!Array.isArray(arr)) arr = [arr];
      } catch {
        arr = [];
      }
    }
    arr.push(entry);
    activity.history = JSON.stringify(arr);

    const updated = await this.activityRepo.save(activity);
    await this.logService.logAction('activity-update', admin.id, 'MAJ activite ' + updated.name);
    return decodeActivity(updated);
  }

  async changeStatus(uuid: string, status: GlobalStatus, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({ where: { uuid } });
    if (!activity) throw new NotFoundException('Activite introuvable');

    const allowed = Object.values(GlobalStatus);
    if (!allowed.includes(status)) {
      throw new BadRequestException('Statut invalide. Valeurs autorisees : ' + allowed.join(', '));
    }
    activity.status = status;
    activity.updated_at = new Date();

    const entry = {
      action: 'Changement de statut ' + status,
      table_action: 'activity-status-change',
      performed_by: admin.firstname + ' ' + admin.lastname,
      admin_uuid,
      performed_at: new Date(),
    };
    let arr: any[] = [];
    if (activity.history) {
      try {
        arr = JSON.parse(activity.history);
        if (!Array.isArray(arr)) arr = [arr];
      } catch {
        arr = [];
      }
    }
    arr.push(entry);
    activity.history = JSON.stringify(arr);

    const updated = await this.activityRepo.save(activity);
    await this.logService.logAction(
      'activity-status-change',
      admin.id,
      'Statut activite ' + updated.name + ' -> ' + status,
    );
    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const activity = await this.activityRepo.findOne({ where: { uuid } });
    if (!activity) throw new NotFoundException('Activite introuvable');
    await this.logService.logAction('activity-delete', admin.id, 'Suppression activite ' + activity.name);
    return await this.activityRepo.softRemove(activity);
  }
}

function toBool(v: any): boolean {
  if (v === true) return true;
  if (typeof v === 'string') return v.toLowerCase() === 'true' || v === '1';
  return false;
}

function safeParse(s: string | null | undefined): any {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export function decodeActivity(a: any) {
  if (!a) return a;
  return {
    ...a,
    organigram: safeParse(a.organigram),
    target_structures: safeParse(a.target_structures) ?? [],
    target_levels: safeParse(a.target_levels) ?? [],
    target_responsibilities: safeParse(a.target_responsibilities) ?? [],
    target_responsibility_levels: safeParse(a.target_responsibility_levels) ?? [],
    target_departments: safeParse(a.target_departments) ?? [],
  };
}
