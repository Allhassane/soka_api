import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CivilityEntity } from './entities/civility.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CivilityService {
  constructor(
    @InjectRepository(CivilityEntity)
    private readonly civilitiesRepo: Repository<CivilityEntity>,
    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const civility = await this.civilitiesRepo.find({
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'civilities-findAll',
      admin.id,
      'recupération de la liste de tous les divisions',
    );

    return civility;
  }

  async store(payload: any, admin_uuid) {
    if (!payload?.name) {
      throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const newCivility = this.civilitiesRepo.create({
      name: payload.name,
      sigle: payload.sigle,
      gender: payload.gender,
      description: payload.description,
      admin_uuid: admin_uuid ?? null,
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'civilities-store',
      admin.id,
      'Enregistrer une civilité',
    );

    const saved = await this.civilitiesRepo.save(newCivility);

    return saved;
  }

  async findOne(uuid: string, admin_uuid) {
    const civility = await this.civilitiesRepo.findOne({ where: { uuid } });

    if (!civility) {
      throw new NotFoundException('Aucune division trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'civilities-findOne',
      admin.id,
      'Recupérer un division',
    );

    return civility;
  }

  async findOneByName(name: string) {
    const civility = await this.civilitiesRepo.findOne({ where: { name } });
    return civility;
  }

  async findOneByGender(gender: "homme" | "femme" | "mixte") {
    const civility = await this.civilitiesRepo.findOne({ where: { gender } });
    return civility;
  }

  async update(uuid: string, payload: any, admin_uuid: string) {
    const { name, gender } = payload;

    if (!uuid || !name || !admin_uuid) {
      throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const existing = await this.civilitiesRepo.findOne({ where: { uuid } });
    if (!existing) {
      throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;
    existing.gender = gender;

    const updated = await this.civilitiesRepo.save(existing);

    await this.logService.logAction('civilities-update', admin.id, updated);

    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const civility = await this.civilitiesRepo.findOne({ where: { uuid } });

    if (!civility) {
      throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'civilities-delete',
      admin.id,
      'Suppression de la civilité ' +
        civility.name +
        ' pour uuid' +
        civility.uuid,
    );

    return await this.civilitiesRepo.softRemove(civility);
  }
}
