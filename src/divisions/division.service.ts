import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DivisionEntity } from './entities/division.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { DepartmentEntity } from 'src/departments/entities/department.entity';

@Injectable()
export class DivisionService {
  constructor(
    @InjectRepository(DivisionEntity)
    private readonly divisionRepo: Repository<DivisionEntity>,
    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(DepartmentEntity)
    private readonly departmentRepo: Repository<DepartmentEntity>,
  ) {}

  async findAll(admin_uuid: string) {
    const division = await this.divisionRepo.find({
      relations: ['department'],
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'division-findAll',
      admin.id,
      'recupération de la liste de tous les divisions',
    );

    return division;
  }

  async store(payload: any, admin_uuid) {
    if (!payload?.name) {
      throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const department = await this.departmentRepo.findOne({
      where: { uuid: payload.department_uuid },
    });

    if (!department) {
      throw new NotFoundException('Identifiant du département introuvable');
    }

    const newDivision = this.divisionRepo.create({
      department_uuid: payload.department_uuid,
      name: payload.name,
      admin_uuid: admin_uuid ?? null,
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'division-store',
      admin.id,
      'Enregistrer une division',
    );

    const saved = await this.divisionRepo.save(newDivision);

    return saved;
  }

  async findOne(uuid: string, admin_uuid) {
    const division = await this.divisionRepo.findOne({ where: { uuid } });

    if (!division) {
      throw new NotFoundException('Aucune division trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'division-findOne',
      admin.id,
      'Recupérer un division',
    );

    return division;
  }

  async update(uuid: string, payload: any, admin_uuid: string) {
    const { name, department_uuid } = payload;

    if (!uuid || !name || !admin_uuid) {
      throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    const department = await this.departmentRepo.findOne({
      where: { uuid: admin_uuid },
    });

    if (!department) {
      throw new NotFoundException('Identifiant du département introuvable');
    }

    const existing = await this.divisionRepo.findOne({ where: { uuid } });
    if (!existing) {
      throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.department_uuid = department_uuid;
    existing.name = name;

    const updated = await this.divisionRepo.save(existing);

    //await this.logService.logAction('division-update', admin.uuid, updated);

    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const division = await this.divisionRepo.findOne({ where: { uuid } });

    if (!division) {
      throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'division-delete',
      admin.id,
      'Suppression de la division  ' +
        division.name +
        ' pour uuid' +
        division.uuid,
    );

    return await this.divisionRepo.softRemove(division);
  }
}
