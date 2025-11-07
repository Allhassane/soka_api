import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ResponsabilityEntity } from './entities/responsability.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class ResponsabilityService {
  constructor(
    @InjectRepository(ResponsabilityEntity)
    private readonly responsabilityRepo: Repository<ResponsabilityEntity>,
    private readonly logService: LogActivitiesService,
    
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const responsability = await this.responsabilityRepo.find({
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'responsabilities-findAll',
      admin.id,
      'recupération de la liste de toutes les responsabilités !'
    );

    return responsability;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const newJob = this.responsabilityRepo.create({
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
      'Enregistrer une responsabilité'
    );

    const saved = await this.responsabilityRepo.save(newJob);

    return saved;
  }

  async findOne(uuid: string,admin_uuid) {
    const responsability = await this.responsabilityRepo.findOne({ where: { uuid } });

    if (!responsability) {
        throw new NotFoundException('Aucune responsabilité trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'responsabilities-findOne',
      admin.id,
      'Recupérer une responsabilité'
    );

    return responsability;
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

 

    const existing = await this.responsabilityRepo.findOne({ where: { uuid } });
    if (!existing) {
        throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;

    const updated = await this.responsabilityRepo.save(existing);

    await this.logService.logAction(
      'responsabilities-update',
      admin.id,
      updated
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const city = await this.responsabilityRepo.findOne({ where: { uuid } });

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
      "Suppression de la responsabilité "+city.name+" pour uuid"+city.uuid,
    );

   return await this.responsabilityRepo.softRemove(city);

  }
}
