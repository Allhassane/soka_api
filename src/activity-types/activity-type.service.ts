import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityTypeEntity } from './entities/activity-type.entity';
import { CreateActivityTypeDto } from './dto/create-activity-type.dto';
import { UpdateActivityTypeDto } from './dto/update-activity-type.dto';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { User } from 'src/users/entities/user.entity';

@Injectable()
export class ActivityTypeService {
  constructor(
    @InjectRepository(ActivityTypeEntity)
    private readonly repo: Repository<ActivityTypeEntity>,
    private readonly logService: LogActivitiesService,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  private async getAdmin(uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");
    return admin;
  }

  async findAll(admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const items = await this.repo.find({ order: { name: 'ASC' } });
    await this.logService.logAction(
      'activity-types-findAll',
      admin.id,
      "Liste des types d'activité",
    );
    return items;
  }

  async store(payload: CreateActivityTypeDto, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const entity = this.repo.create({
      name: payload.name,
      description: payload.description ?? null,
      admin_uuid,
    });
    const saved = await this.repo.save(entity);
    await this.logService.logAction(
      'activity-types-store',
      admin.id,
      `Création du type d'activité "${saved.name}"`,
    );
    return saved;
  }

  async findOne(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const item = await this.repo.findOne({ where: { uuid } });
    if (!item) throw new NotFoundException("Type d'activité introuvable");
    await this.logService.logAction(
      'activity-types-findOne',
      admin.id,
      `Récupération du type d'activité "${item.name}"`,
    );
    return item;
  }

  async update(uuid: string, payload: UpdateActivityTypeDto, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const item = await this.repo.findOne({ where: { uuid } });
    if (!item) throw new NotFoundException("Type d'activité introuvable");
    if (payload.name !== undefined) item.name = payload.name;
    if (payload.description !== undefined) item.description = payload.description ?? null;
    const updated = await this.repo.save(item);
    await this.logService.logAction(
      'activity-types-update',
      admin.id,
      `Mise à jour du type d'activité "${updated.name}"`,
    );
    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const admin = await this.getAdmin(admin_uuid);
    const item = await this.repo.findOne({ where: { uuid } });
    if (!item) throw new NotFoundException("Type d'activité introuvable");
    await this.logService.logAction(
      'activity-types-delete',
      admin.id,
      `Suppression du type d'activité "${item.name}"`,
    );
    return await this.repo.softRemove(item);
  }
}
