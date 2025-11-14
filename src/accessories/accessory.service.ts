import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccessoryEntity } from './entities/accessory.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class AccessoryService {
  constructor(
    @InjectRepository(AccessoryEntity)
    private readonly accessoryRepo: Repository<AccessoryEntity>,
    private readonly logService: LogActivitiesService,
    
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const accessory = await this.accessoryRepo.find({
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'accessories-findAll',
      admin.id,
      'recupération de la liste de tous les accessoires !'
    );

    return accessory;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const newJob = this.accessoryRepo.create({
      name: payload.name,
      from_last_version: payload.from_last_version ?? null,
      admin_uuid: admin_uuid ?? null,
    });
    
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'accessories-store',
      admin.id,
      'Enregistrer une division'
    );

    const saved = await this.accessoryRepo.save(newJob);

    return saved;
  }

  async findOne(uuid: string,admin_uuid) {
    const accessory = await this.accessoryRepo.findOne({ where: { uuid } });

    if (!accessory) {
        throw new NotFoundException('Aucun accessoire trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'accessories-findOne',
      admin.id,
      'Recupérer un division'
    );

    return accessory;
  }

  async findOneByName(name: string) {
    const accessory = await this.accessoryRepo.findOne({ where: { name } });

    return accessory;
  }

  async findOneByLastVersionName(name: string) {
    const accessory = await this.accessoryRepo.findOne({ where: { from_last_version: name } });

    return accessory;
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

 

    const existing = await this.accessoryRepo.findOne({ where: { uuid } });
    if (!existing) {
        throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;

    const updated = await this.accessoryRepo.save(existing);

    await this.logService.logAction(
      'accessories-update',
      admin.id,
      updated
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const job = await this.accessoryRepo.findOne({ where: { uuid } });

    if (!job) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'accessories-delete',
      admin.id,
      "Suppression de l'accessoire "+job.name+" pour uuid"+job.uuid,
    );

   return await this.accessoryRepo.softRemove(job);

  }
}
