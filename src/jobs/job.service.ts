import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JobEntity } from './entities/job.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { find } from 'rxjs';

@Injectable()
export class JobService {
  constructor(
    @InjectRepository(JobEntity)
    private readonly jobRepo: Repository<JobEntity>,
    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async findAll(admin_uuid: string) {
    const job = await this.jobRepo.find({
      order: { name: 'ASC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'jobs-findAll',
      admin.id,
      'recupération de la liste de tous les formations'
    );

    return job;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const check_job = await this.jobRepo.findOne({ where: { name: payload.name } });
    if(check_job){
      console.log('job existe');
      return check_job;
    }

    const newJob = this.jobRepo.create({
      name: payload.name,
      admin_uuid: admin_uuid ?? null,
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'jobs-store',
      admin.id,
      'Enregistrer une division'
    );

    const saved = await this.jobRepo.save(newJob);

    return saved;
  }

  async findOne(uuid: string,admin_uuid) {
    const job = await this.jobRepo.findOne({ where: { uuid } });

    if (!job) {
        throw new NotFoundException('Aucune job trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'jobs-findOne',
      admin.id,
      'Recupérer un division'
    );

    return job;
  }

  async findOneByName(name: string) {
    const job = await this.jobRepo.findOne({ where: { name } });

    return job;
  }

  async findOneBySlug(slug: string) {
    const job = await this.jobRepo.findOne({ where: { slug } });

    return job;
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



    const existing = await this.jobRepo.findOne({ where: { uuid } });
    if (!existing) {
        throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;

    const updated = await this.jobRepo.save(existing);

    await this.logService.logAction(
      'jobs-update',
      admin.id,
      updated
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const job = await this.jobRepo.findOne({ where: { uuid } });

    if (!job) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'jobs-delete',
      admin.id,
      "Suppression de la job "+job.name+" pour uuid"+job.uuid,
    );

   return await this.jobRepo.softRemove(job);

  }
}
