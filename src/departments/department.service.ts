import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { DepartmentEntity } from './entities/department.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { v4 as uuid } from 'uuid';

@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(DepartmentEntity)
    private readonly departmentRepo: Repository<DepartmentEntity>,
    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

  ) {}

  // recuperer tous les départements par genre (homme/femme) [findByGender]
  async findByGender(gender: string,admin_uuid: string) {

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    let genders: string[] = [];
      genders.push(gender);
      genders.push('mixte');

      const departement = await this.departmentRepo.find({
        where: {
          gender: In(genders),
        },
      });

    await this.logService.logAction(
      'department-findByGender',
      admin.id,
      'recupération des départements par genre: '+gender
    );

    return departement;
  }


  async findAll(admin_uuid: string) {
    const departement = await this.departmentRepo.find({
       relations: ['divisions'],
      order: { name: 'ASC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'department-findAll',
      admin.id,
      'recupération de la liste de tous les départements'
    );

    return departement;
  }

  async store(payload: any,admin_uuid) {
    if (!payload?.name) {
        throw new NotFoundException('Veuillez renseigner tous les champs');
    }

    // verifier si le departement existe
    const $check_department = await this.departmentRepo.findOne({ where: {name: payload.name} });

    if($check_department){

      return $check_department;
    }


    const newModule = this.departmentRepo.create({
      uuid: payload.uuid ?? uuid(),
      name: payload.name,
      gender: payload.gender ?? 'mixte',
      description: payload.description ?? null,
      admin_uuid: admin_uuid ?? null,
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'department-store',
      admin.id,
      'Enregistrer un departement'
    );

    const saved = await this.departmentRepo.save(newModule);

    return saved;
  }

  async findOne(uuid: string,admin_uuid) {
    const departement = await this.departmentRepo.findOne({ where: { uuid } });

    if (!departement) {
        throw new NotFoundException('Aucun module trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'department-findOne',
      admin.id,
      'Recupérer un département'
    );

    return  departement;
  }

  async findOneByName(name: string) {
    const departement = await this.departmentRepo.findOne({ where: { name } });
    return  departement;
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



    const existing = await this.departmentRepo.findOne({ where: { uuid } });
    if (!existing) {

      throw new NotFoundException('Aucune correspondance retrouvée !');
    }

    existing.name = name;
    existing.description = payload.description ?? existing.description;
    existing.gender = payload.gender ?? existing.gender;

    const updated = await this.departmentRepo.save(existing);

    await this.logService.logAction(
      'department-update',
      admin.id,
      updated
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const departement = await this.departmentRepo.findOne({ where: { uuid } });

    if (!departement) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'department-delete',
      admin.id,
      "Suppression du département  "+departement.name+" pour uuid"+departement.uuid,
    );

   return await this.departmentRepo.softRemove(departement);

  }
}
