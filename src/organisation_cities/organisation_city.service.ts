import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrganisationCityEntity } from './entities/organisation_city.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class OrganisationCityService {
  constructor(
    @InjectRepository(OrganisationCityEntity)
    private readonly organisationCityRepo: Repository<OrganisationCityEntity>,
    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const city = await this.organisationCityRepo.find({
      order: { name: 'ASC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'organisation-cities-findAll',
      admin.id,
      'recupération de la liste de tous les villes'
    );

    return city;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const check_city = await this.organisationCityRepo.findOne({ where: { name: payload.name}});
    if(check_city){
      console.log('organisation city existe');
      return check_city;
    }
    const newCity = this.organisationCityRepo.create({
      name: payload.name,
      admin_uuid: admin_uuid ?? null,
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'organisation-cities-store',
      admin.id,
      'Enregistrer une ville'
    );

    const saved = await this.organisationCityRepo.save(newCity);

    return saved;
  }

  async findOne(uuid: string,admin_uuid) {
    const city = await this.organisationCityRepo.findOne({ where: { uuid } });

    if (!city) {
        throw new NotFoundException('Aucune division trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'organisation-cities-findOne',
      admin.id,
      'Recupérer un ville'
    );

    return city;
  }
  async findOneByName(name: string) {
    const city = await this.organisationCityRepo.findOne({ where: { name } });

    return city;
  }

  async findOneBySlug(slug: string) {
    const city = await this.organisationCityRepo.findOne({ where: { slug } });

    return city;
  }

  async update(uuid: string,payload: any,admin_uuid: string) {
    const { name, gender } = payload;

    if (!uuid || !name || !admin_uuid) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }



    const existing = await this.organisationCityRepo.findOne({ where: { uuid } });
    if (!existing) {
        throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;

    const updated = await this.organisationCityRepo.save(existing);

    await this.logService.logAction(
      'organisation-cities-update',
      admin.id,
      updated
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const city = await this.organisationCityRepo.findOne({ where: { uuid } });

    if (!city) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'civilities-delete',
      admin.id,
      "Suppression de la civilité "+city.name+" pour uuid"+city.uuid,
    );

   return await this.organisationCityRepo.softRemove(city);

  }
}
