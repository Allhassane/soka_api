import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DivisionEntity } from './entities/division.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { DepartmentEntity } from 'src/departments/entities/department.entity';
import { v4 as uuid } from 'uuid';

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
      order: { name: 'ASC' },
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

  async store(payload: any, admin_uuid: string) {
    if (!payload?.name || !payload?.department_uuid) {
      throw new BadRequestException('Veuillez renseigner tous les champs requis.');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const department = await this.departmentRepo.findOne({
      where: { uuid: payload.department_uuid },
    });
    if (!department) {
      throw new NotFoundException('Département introuvable.');
    }

    const check_division = await this.divisionRepo.findOne({ where:{ name : payload.name, department_uuid: department.uuid} });
    if(check_division){
      console.log('division existe');
      return check_division;
    }

    const newDivision = this.divisionRepo.create({
      uuid: payload.uuid ?? uuid(),
      name: payload.name,
      description: payload.description ?? null,
      department_uuid: department.uuid,
      department_id: department.id,
      gender: payload.gender ?? "mixte",
      admin_uuid,
      status: 'enable',
    });

    const saved = await this.divisionRepo.save(newDivision);

    // Journalisation de l’action
    await this.logService.logAction(
      'division-store',
      admin.id,
      `Création de la division "${saved.name}" rattachée au département "${department.name}"`,
    );

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

  async findOneByName(name: string) {
    const division = await this.divisionRepo.findOne({ where: { name } });

    return division;
  }

    async findByDepartmentAndCivility(department_uuid: string, gender: string, admin_uuid) {
      let genders: string[] = [];
      genders.push(gender);
      genders.push('mixte');

      const division = await this.divisionRepo.find({
        where: {
          department_uuid: department_uuid,
          gender: In(genders),
        },
      });

      return division;
    }


  async update(uuid: string, payload: any, admin_uuid: string) {
    const { name, department_uuid, gender } = payload;

    if (!uuid || !name || !admin_uuid) {
      throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    const department = await this.departmentRepo.findOne({
      where: { uuid: department_uuid },
    });

    if (!department) {
      throw new NotFoundException('Identifiant du département introuvable');
    }

    const existing = await this.divisionRepo.findOne({ where: { uuid } });
    if (!existing) {
      throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.department_uuid = department.uuid;
    existing.department_id = department.id;
    existing.name = name;
    existing.gender = gender;

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
