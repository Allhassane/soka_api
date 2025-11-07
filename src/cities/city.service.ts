import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CityEntity } from './entities/city.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CityService {
  constructor(
    @InjectRepository(CityEntity)
    private readonly cityRepo: Repository<CityEntity>,
    private readonly logService: LogActivitiesService,
    
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const city = await this.cityRepo.find({
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'cities-findAll',
      admin.id,
      'recupération de la liste de toutes les localités de résidence !'
    );

    return city;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const newJob = this.cityRepo.create({
      name: payload.name,
      admin_uuid: admin_uuid ?? null,
    });
    
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'cities-store',
      admin.id,
      'Enregistrer une localité'
    );

    const saved = await this.cityRepo.save(newJob);

    return saved;
  }

  async findOne(uuid: string,admin_uuid) {
    const city = await this.cityRepo.findOne({ where: { uuid } });

    if (!city) {
        throw new NotFoundException('Aucune localité trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'cities-findOne',
      admin.id,
      'Recupérer une localité'
    );

    return city;
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

 

    const existing = await this.cityRepo.findOne({ where: { uuid } });
    if (!existing) {
        throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;

    const updated = await this.cityRepo.save(existing);

    await this.logService.logAction(
      'cities-update',
      admin.id,
      updated
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const city = await this.cityRepo.findOne({ where: { uuid } });

    if (!city) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'cities-delete',
      admin.id,
      "Suppression de la localité "+city.name+" pour uuid"+city.uuid,
    );

   return await this.cityRepo.softRemove(city);

  }
}
