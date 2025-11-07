import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommitteesEntity } from './entities/committees.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';

@Injectable()
export class CommitteeService {
  constructor(
    @InjectRepository(CommitteesEntity)
    private readonly committeesRepo: Repository<CommitteesEntity>,
    private readonly logService: LogActivitiesService,
    
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const division = await this.committeesRepo.find({
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'committees-findAll',
      admin.id,
      'recupération de la liste de tous les divisions'
    );

    return division;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const newCommittees = this.committeesRepo.create({
      name: payload.name,
      admin_uuid: admin_uuid ?? null,
    });
    
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'committees-store',
      admin.id,
      'Enregistrer du comité'
    );

    const saved = await this.committeesRepo.save(newCommittees);

    return saved;
  }

  async findOne(uuid: string,admin_uuid) {
    const committees = await this.committeesRepo.findOne({ where: { uuid } });

    if (!committees) {
        throw new NotFoundException('Aucune division trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'committees-findOne',
      admin.id,
      'Recupérer un comité'
    );

    return committees;
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

 

    const existing = await this.committeesRepo.findOne({ where: { uuid } });
    if (!existing) {
        throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;

    const updated = await this.committeesRepo.save(existing);

    await this.logService.logAction(
      'committees-update',
      admin.id,
      updated
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const committe = await this.committeesRepo.findOne({ where: { uuid } });

    if (!committe) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    
    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'committees-delete',
      admin.id,
      "Suppression du comité  "+committe.name+" pour uuid"+committe.uuid,
    );

   return await this.committeesRepo.softRemove(committe);

  }
}
