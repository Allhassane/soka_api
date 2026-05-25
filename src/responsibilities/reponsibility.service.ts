import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { ResponsibilityEntity } from './entities/responsibility.entity';
import { LevelService } from 'src/level/level.service';
import { v4 as uuidv4 } from 'uuid';
import { slugify } from 'transliteration';
import { Role } from 'src/roles/entities/role.entity';
import { RoleService } from 'src/roles/role.service';

@Injectable()
export class ResponsibilityService {
  constructor(
    @InjectRepository(ResponsibilityEntity)
    private readonly responsibilityRepo: Repository<ResponsibilityEntity>,
    private readonly logService: LogActivitiesService,
    private readonly levelRepo: LevelService,

        private readonly roleRepo: RoleService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const responsibility = await this.responsibilityRepo.find({
      order: { name: 'ASC' },
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

    if (!payload.level_uuid) {
      throw new NotFoundException('Veuillez renseigner le niveau');
    }

    if (!payload.role_uuid) {
      throw new NotFoundException('Veuillez renseigner le rôle');
    }

    const level = await this.levelRepo.findOne(payload.level_uuid);

    if (!level) {
      throw new NotFoundException('Niveau introuvable');
    }

    const role = await this.roleRepo.findOneByUuid(payload.role_uuid as string);

    if (!role) {
      throw new NotFoundException('Role introuvable');
    }

    const check_responsibility = await this.responsibilityRepo.findOne({
      where: {
        name: payload.nname,
        gender: payload.gender,
        level_uuid: level.uuid,
        role_uuid: role.uuid
      }
    });

    if(check_responsibility){
      //console.log('responsibility existe');
      return check_responsibility;
    }

    const newJob = this.responsibilityRepo.create({
      uuid: payload.uuid ?? uuidv4(),
      name: payload.name,
      slug: slugify(payload.name),
      admin_uuid: admin_uuid ?? null,
      level_uuid: level.uuid,
      level,
      role_uuid: role.uuid,
      role,
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

  async findOneByName(name: string) {
    const responsibility = await this.responsibilityRepo.findOne({
      where: { name },
    });

    return responsibility;
  }

  async findOneBySlug(slug: string) {
    const responsibility = await this.responsibilityRepo.findOne({
      where: { slug },
    });

    return responsibility;
  }

  async findByLevel(uuid: string, admin_uuid) {
    //await this.levelRepo.findOne(uuid);

    const responsibility = await this.responsibilityRepo.find({
      where: { level_uuid: uuid },
    });

    return responsibility;
  }

  async findByLevelAndCivility(level_uuid: string, gender: string, admin_uuid) {
    let genders: string[] = [];
    genders.push(gender);
    genders.push('mixte');

    const responsibility = await this.responsibilityRepo.find({
      where: {
        level_uuid: level_uuid,
        gender: In(genders),
      },
    });

    return responsibility;
  }

  async update(uuid: string, payload: any, admin_uuid: string) {
    const { name } = payload;

    if (!uuid || !name || !admin_uuid) {
      throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    if (!payload.level_uuid) {
      throw new NotFoundException('Veuillez renseigner le niveau');
    }

    if (!payload.role_uuid) {
      throw new NotFoundException('Veuillez renseigner le rôle');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const existing = await this.responsibilityRepo.findOne({ where: { uuid } });
    if (!existing) {
      throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    const level = await this.levelRepo.findOne(payload.level_uuid);

    if (!level) {
      throw new NotFoundException('Niveau introuvable');
    }

    const role = await this.roleRepo.findOneByUuid(payload.role_uuid as string);

    if (!role) {
      throw new NotFoundException('Role introuvable');
    }

    existing.name = name;
    existing.slug = slugify(name);
    existing.level_uuid = level.uuid;
    existing.level = level;
    existing.role_uuid = role.uuid;
    existing.role = role;
    existing.gender = payload.gender;

    const updated = await this.responsibilityRepo.save(existing);

    await this.logService.logAction(
      'responsibilities-update',
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

  async findByRespoUuid(uuid: string, respo_uuid) {

    const responsibility = await this.responsibilityRepo.find({
      where: { uuid: respo_uuid },
    });

    return responsibility;
  }
}
