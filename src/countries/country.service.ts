import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryEntity } from './entities/country.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CountryService {
  constructor(
    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,
    private readonly logService: LogActivitiesService,
    
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

    async onModuleInit() {
    const count = await this.countryRepo.count();
    if (count > 0) {
      console.log(` ${count} pays déjà présents — aucune insertion.`);
      return;
    }

    const paysList = [
      { name: 'AFGHANISTAN', capital: 'KABOUL', continent: 'ASIE', status: 'enable' },
      { name: 'AFGHANISTAN', capital: 'KABOUL', continent: 'ASIE', status: 'enable' },
      
    ];

    await this.countryRepo.save(paysList);
    console.log(`🌍 ${paysList.length} pays ont été insérés avec succès.`);
  }


  async findAll(admin_uuid: string) {
    const counrty = await this.countryRepo.find({
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'countries-findAll',
      admin.id,
      'recupération de la liste de tous les formations'
    );

    return counrty;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const newCountry = this.countryRepo.create({
      name: payload.name,
      captial:payload.captial ?? null,
      continent: payload.continent ?? null,
      admin_uuid: admin_uuid ?? null,
    });
    
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'countries-store',
      admin.id,
      'Enregistrer une division'
    );

    const saved = await this.countryRepo.save(newCountry);

    return saved;
  }

  async findOne(uuid: string,admin_uuid) {
    const country = await this.countryRepo.findOne({ where: { uuid } });

    if (!country) {
        throw new NotFoundException('Aucune pays trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'countries-findOne',
      admin.id,
      'Recupérer un pays'
    );

    return country;
  }

  async update(uuid: string,payload: any,admin_uuid: string) {
    const { name, capital, continent } = payload;

    if (!uuid || !name || !admin_uuid) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

 

    const existing = await this.countryRepo.findOne({ where: { uuid } });
    if (!existing) {
        throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;
    existing.captial= capital;
    existing.continent= continent;

    const updated = await this.countryRepo.save(existing);

    await this.logService.logAction(
      'countries-update',
      admin.id,
      updated
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const country = await this.countryRepo.findOne({ where: { uuid } });

    if (!country) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'countries-delete',
      admin.id,
      "Suppression du pays "+country.name+" pour uuid"+country.uuid,
    );

   return await this.countryRepo.softRemove(country);

  }
}
