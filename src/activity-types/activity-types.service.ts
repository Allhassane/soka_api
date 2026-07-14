import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityTypeEntity, ActivityTypeFamily, ActivityTypeSubcategory } from './entities/activity-type.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { User } from 'src/users/entities/user.entity';
import { CreateActivityTypeDto } from './dto/create-activity-type.dto';
import { UpdateActivityTypeDto } from './dto/update-activity-type.dto';

const SUBCATEGORY_NAMES: Record<ActivityTypeSubcategory, string> = {
  [ActivityTypeSubcategory.MENSUELLE_DEPARTEMENT]: 'Mensuelle par département',
  [ActivityTypeSubcategory.GRANDE_COMMEMORATION]: 'Grande commémoration',
  [ActivityTypeSubcategory.ZANDAKAI]: 'Zandakai',
  [ActivityTypeSubcategory.GONGYO_KOSEN_RUFU]: 'Gongyo de kosen rufu',
  [ActivityTypeSubcategory.GONGYO_LENT]: 'Gongyo lent',
  [ActivityTypeSubcategory.SPORADIQUE_NATIONALE]: 'Sporadique nationale',
  [ActivityTypeSubcategory.SPORADIQUE_LOCALE]: 'Sporadique locale',
};

@Injectable()
export class ActivityTypesService {
  constructor(
    @InjectRepository(ActivityTypeEntity)
    private readonly activityTypeRepo: Repository<ActivityTypeEntity>,
    private readonly logService: LogActivitiesService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private async getAdmin(uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");
    return admin;
  }

  async findAll(admin_uuid: string, family?: ActivityTypeFamily) {
    const admin = await this.getAdmin(admin_uuid);
    const where: any = {};
    if (family) where.family = family;
    const items = await this.activityTypeRepo.find({ where, order: { family: 'ASC', name: 'ASC' } });
    await this.logService.logAction(
      'activity-types-findAll',
      admin.id,
      `Liste des types d'activité (${items.length})${family ? ' famille=' + family : ''}`,
    );
    return items;
  }

  async findOne(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const item = await this.activityTypeRepo.findOne({ where: { uuid } });
    if (!item) throw new NotFoundException("Type d'activité introuvable");
    await this.logService.logAction(
      'activity-types-findOne',
      admin.id,
      `Consultation type activité ${item.name}`,
    );
    return item;
  }

  async create(payload: CreateActivityTypeDto, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const derivedName = payload.name || SUBCATEGORY_NAMES[payload.subcategory];
    const item = this.activityTypeRepo.create({
      name: derivedName,
      description: payload.description ?? null,
      family: payload.family,
      subcategory: payload.subcategory,
      requires_quota: payload.requires_quota ?? false,
      requires_committee: payload.requires_committee ?? false,
      default_recurrence_rule: payload.default_recurrence_rule ?? null,
      admin_uuid,
    });
    const saved = await this.activityTypeRepo.save(item);
    await this.logService.logAction(
      'activity-types-create',
      admin.id,
      `Création type activité "${saved.name}" (${saved.family})`,
    );
    return saved;
  }

  async update(uuid: string, payload: UpdateActivityTypeDto, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const item = await this.activityTypeRepo.findOne({ where: { uuid } });
    if (!item) throw new NotFoundException("Type d'activité introuvable");

    if (payload.subcategory !== undefined) {
      item.subcategory = payload.subcategory;
      item.name = SUBCATEGORY_NAMES[payload.subcategory];
    }
    if (payload.description !== undefined) item.description = payload.description ?? null;
    if (payload.family !== undefined) item.family = payload.family;
    if (payload.requires_quota !== undefined) item.requires_quota = payload.requires_quota;
    if (payload.requires_committee !== undefined) item.requires_committee = payload.requires_committee;
    if (payload.default_recurrence_rule !== undefined)
      item.default_recurrence_rule = payload.default_recurrence_rule ?? null;
    if (payload.status !== undefined) item.status = payload.status;

    const updated = await this.activityTypeRepo.save(item);
    await this.logService.logAction(
      'activity-types-update',
      admin.id,
      `Mise à jour type activité "${updated.name}"`,
    );
    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const item = await this.activityTypeRepo.findOne({ where: { uuid } });
    if (!item) throw new NotFoundException("Type d'activité introuvable");
    await this.logService.logAction(
      'activity-types-delete',
      admin.id,
      `Suppression type activité "${item.name}"`,
    );
    return await this.activityTypeRepo.softRemove(item);
  }
}
