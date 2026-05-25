import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaritalStatusEntity } from './entities/marital-status.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class MaritalStatusService {
  constructor(
    @InjectRepository(MaritalStatusEntity)
    private readonly divisionRepo: Repository<MaritalStatusEntity>,
    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const division = await this.divisionRepo.find({
      order: { name: 'ASC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'marital-status-findAll',
      admin.id,
      'recupération de la liste de tous les divisions'
    );

    return division;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const check_marital = await this.divisionRepo.findOne({ where:{ name: payload.name} });
    if(check_marital){
      console.log('marital status existe');
      return check_marital;
    }

    const newMarital = this.divisionRepo.create({
      name: payload.name,
      admin_uuid: admin_uuid ?? null,
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'marital-status-store',
      admin.id,
      'Enregistrer une division'
    );

    const saved = await this.divisionRepo.save(newMarital);

    return saved;
  }

  async findOne(uuid: string,admin_uuid) {
    const division = await this.divisionRepo.findOne({ where: { uuid } });

    if (!division) {
        throw new NotFoundException('Aucune division trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'marital-status-findOne',
      admin.id,
      'Recupérer un division'
    );

    return division;
  }

  async findOneByName(name: string) {
    const division = await this.divisionRepo.findOne({ where: { name } });
    return division;
  }

  async update(uuid: string,payload: any,admin_uuid: string) {
    const { name } = payload;

    if (!uuid || !name || !admin_uuid) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }



    const existing = await this.divisionRepo.findOne({ where: { uuid } });
    if (!existing) {
        throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;

    const updated = await this.divisionRepo.save(existing);

    await this.logService.logAction(
      'marital-status-update',
      admin.id,
      updated
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const division = await this.divisionRepo.findOne({ where: { uuid } });

    if (!division) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'marital-status-delete',
      admin.id,
      "Suppression de la division  "+division.name+" pour uuid"+division.uuid,
    );

   return await this.divisionRepo.softRemove(division);

  }
}
