import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { ResponsibilityEntity } from './entities/responsibility.entity';
import { LevelService } from 'src/level/level.service';

@Injectable()
export class ResponsibilityService {
  constructor(
    @InjectRepository(ResponsibilityEntity)
    private readonly responsibilityRepo: Repository<ResponsibilityEntity>,
    private readonly logService: LogActivitiesService,
    private readonly levelRepo: LevelService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const responsibility = await this.responsibilityRepo.find({
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'responsabilities-findAll',
      admin.id,
      'recupération de la liste de toutes les responsabilités !',
    );

    return responsibility;
  }

  async store(payload: any, admin_uuid) {
    if (!payload?.name) {
      throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const level = await this.levelRepo.findOne(payload.level_uuid as string);

    if (!level) {
      throw new NotFoundException('Niveau introuvable');
    }

    const newJob = this.responsibilityRepo.create({
      name: payload.name,
      admin_uuid: admin_uuid ?? null,
      level_uuid: level.uuid,
      level,
      gender: payload.gender,
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'responsibilities-store',
      admin.id,
      'Enregistrer une responsabilité',
    );

    const saved = await this.responsibilityRepo.save(newJob);

    return saved;
  }

  async findOne(uuid: string, admin_uuid) {
    const responsibility = await this.responsibilityRepo.findOne({
      where: { uuid },
    });

    if (!responsibility) {
      throw new NotFoundException('Aucune responsabilité trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'responsabilities-findOne',
      admin.id,
      'Recupérer une responsabilité',
    );

    return responsibility;
  }

  async findByLevel(uuid: string, admin_uuid) {
    //await this.levelRepo.findOne(uuid);

    const responsibility = await this.responsibilityRepo.find({
      where: { level_uuid: uuid },
    });

    return responsibility;
  }

  async update(uuid: string, payload: any, admin_uuid: string) {
    const { name } = payload;

    if (!uuid || !name || !admin_uuid) {
      throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const existing = await this.responsibilityRepo.findOne({ where: { uuid } });
    if (!existing) {
      throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    const level = await this.levelRepo.findOne(payload.level_uuid as string);

    if (!level) {
      throw new NotFoundException('Niveau introuvable');
    }

    existing.name = name;
    existing.level_uuid = level.uuid;
    existing.level = level;
    existing.gender = payload.gender;

    const updated = await this.responsibilityRepo.save(existing);

    await this.logService.logAction(
      'responsabilities-update',
      admin.id,
      updated,
    );

    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const city = await this.responsibilityRepo.findOne({ where: { uuid } });

    if (!city) {
      throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'responsabilities-delete',
      admin.id,
      'Suppression de la responsabilité ' +
        city.name +
        ' pour uuid' +
        city.uuid,
    );

    return await this.responsibilityRepo.softRemove(city);
  }
}
