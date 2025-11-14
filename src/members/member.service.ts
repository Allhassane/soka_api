import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MemberEntity } from './entities/member.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { CreateMemberDto } from './dto/create-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { CivilityEntity } from 'src/civilities/entities/civility.entity';
import { MemberResponsibilityEntity } from 'src/⁠member-responsibility/entities/member-responsibility.entity';
import { ResponsibilityService } from 'src/responsibilities/reponsibility.service';
import { AccessoryService } from 'src/accessories/accessory.service';
import { MemberAccessoryEntity } from 'src/member-accessories/entities/member-accessories.entity';
import { MaritalStatusEntity } from 'src/marital-status/entities/marital-status.entity';
import { CountryEntity } from 'src/countries/entities/country.entity';
import { CityEntity } from 'src/cities/entities/city.entity';
import { FormationEntity } from 'src/formations/entities/formation.entity';
import { JobEntity } from 'src/jobs/entities/job.entity';
import { OrganisationCityEntity } from 'src/organisation_cities/entities/organisation_city.entity';
import { DepartmentEntity } from 'src/departments/entities/department.entity';
import { DivisionEntity } from 'src/divisions/entities/division.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';

@Injectable()
export class MemberService {
  constructor(
    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,

    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(CivilityEntity)
    private readonly civilityRepo: Repository<CivilityEntity>,

    @InjectRepository(MemberResponsibilityEntity)
    private readonly memberResponsibilityRepo: Repository<MemberResponsibilityEntity>,

    @InjectRepository(MemberAccessoryEntity)
    private readonly memberAccessoryRepo: Repository<MemberAccessoryEntity>,

    @InjectRepository(MaritalStatusEntity)
    private readonly maritalStatusRepo: Repository<MaritalStatusEntity>,

    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,

    @InjectRepository(CityEntity)
    private readonly cityRepo: Repository<CityEntity>,

    @InjectRepository(FormationEntity)
    private readonly formationRepo: Repository<FormationEntity>,

    @InjectRepository(JobEntity)
    private readonly jobRepo: Repository<JobEntity>,

    @InjectRepository(OrganisationCityEntity)
    private readonly organisationCityRepo: Repository<OrganisationCityEntity>,

    @InjectRepository(DepartmentEntity)
    private readonly departmentRepo: Repository<DepartmentEntity>,

    @InjectRepository(DivisionEntity)
    private readonly divisionRepo: Repository<DivisionEntity>,

    @InjectRepository(StructureEntity)
    private readonly structureRepo: Repository<StructureEntity>,




    private readonly responsibilityService: ResponsibilityService,

    private readonly accessoryService: AccessoryService,

  ) {}


    async store(dto: CreateMemberDto, admin_uuid: string): Promise<MemberEntity> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    // ---- Vérification civilité obligatoire ----
    const civility = await this.civilityRepo.findOne({
      where: { uuid: dto.civility_uuid },
    });
    if (!civility) {
      throw new NotFoundException('Civilité introuvable.');
    }

    // ---- Génération matricule ----
    const lastMember = await this.memberRepo
      .createQueryBuilder('m')
      .orderBy('m.id', 'DESC')
      .getOne();

    const nextId = lastMember ? lastMember.id + 1 : 1;
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    const matricule = `${yearSuffix}-${String(nextId).padStart(4, '0')}`;

    // ---- Création du membre ----
    const member = this.memberRepo.create({
      ...dto,
      matricule,
      gender: civility.gender,
      admin_uuid,
      status: dto.status ?? 'enable',
    });

    // ----------------------------------------------------------
    // 🔵 Hydrate toutes les relations ManyToOne ici
    // ----------------------------------------------------------

    member.civility = civility;

    if (dto.marital_status_uuid) {
      member.marital_status = await this.maritalStatusRepo.findOne({
        where: { uuid: dto.marital_status_uuid },
      });
    }

    if (dto.country_uuid) {
      member.country = await this.countryRepo.findOne({
        where: { uuid: dto.country_uuid },
      });
    }

    if (dto.city_uuid) {
      member.city = await this.cityRepo.findOne({
        where: { uuid: dto.city_uuid },
      });
    }

    if (dto.formation_uuid) {
      member.formation = await this.formationRepo.findOne({
        where: { uuid: dto.formation_uuid },
      });
    }

    if (dto.job_uuid) {
      member.job = await this.jobRepo.findOne({
        where: { uuid: dto.job_uuid },
      });
    }

    if (dto.organisation_city_uuid) {
      member.organisation_city = await this.organisationCityRepo.findOne({
        where: { uuid: dto.organisation_city_uuid },
      });
    }

    if (dto.department_uuid) {
      member.department = await this.departmentRepo.findOne({
        where: { uuid: dto.department_uuid },
      });
    }

    if (dto.division_uuid) {
      member.division = await this.divisionRepo.findOne({
        where: { uuid: dto.division_uuid },
      });
    }

    if (dto.structure_uuid) {
      member.structure = await this.structureRepo.findOne({
        where: { uuid: dto.structure_uuid },
      });
    }

    // ----------------------------------------------------------
    // Sauvegarde
    // ----------------------------------------------------------
    const saved = await this.memberRepo.save(member);

    // ----------------------------------------------------------
    // Responsabilité
    // ----------------------------------------------------------
    if (dto.responsibility_uuid) {
      const responsibility = await this.responsibilityService.findOne(
        dto.responsibility_uuid,
        admin_uuid,
      );

      const memberResponsibility = this.memberResponsibilityRepo.create({
        member_uuid: saved.uuid,
        member: saved,
        responsibility_uuid: dto.responsibility_uuid,
        responsibility,
        priority: 'high',
      });

      await this.memberResponsibilityRepo.save(memberResponsibility);
    }

    // ----------------------------------------------------------
    // Accessoires
    // ----------------------------------------------------------
    if (dto.accessories && dto.accessories.length > 0) {
      for (const accessoryUuid of dto.accessories) {
        const accessory = await this.accessoryService.findOne(
          accessoryUuid,
          admin_uuid,
        );

        if (accessory) {
          const memberAccessory = this.memberAccessoryRepo.create({
            member_uuid: saved.uuid,
            member: saved,
            accessory_uuid: accessoryUuid,
            accessory,
          });
          await this.memberAccessoryRepo.save(memberAccessory);
        }
      }
    }

    // ----------------------------------------------------------
    // Logs
    // ----------------------------------------------------------
    await this.logService.logAction(
      'members-store',
      admin.id,
      `Création du membre ${saved.firstname} ${saved.lastname} (${saved.matricule})`,
    );

    return saved;
  }


  async update(uuid: string, dto: UpdateMemberDto, admin_uuid: string): Promise<MemberEntity> {
    // Vérification de l'administrateur
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    // Vérification du membre existant
    const existingMember = await this.memberRepo.findOne({ where: { uuid } });
    if (!existingMember) throw new NotFoundException('Membre introuvable.');

    // Si la civilité change → mettre à jour le genre
    if (dto.civility_uuid) {
      const civility = await this.civilityRepo.findOne({
        where: { uuid: dto.civility_uuid },
      });
      if (!civility) {
        throw new NotFoundException('Civilité introuvable.');
      }
      existingMember.gender = civility.gender;
      existingMember.civility_uuid = dto.civility_uuid;
    }

    // Mise à jour des champs simples
    Object.assign(existingMember, {
      ...dto,
      admin_uuid,
      updated_at: new Date(),
    });

    const updated = await this.memberRepo.save(existingMember);

    // Mise à jour de la responsabilité (si fournie)
    if (dto.responsibility_uuid) {
      // Vérifie si la responsabilité existe
      const responsibility = await this.responsibilityService.findOne(
        dto.responsibility_uuid,
        admin_uuid,
      );
      if (!responsibility) {
        throw new NotFoundException('Responsabilité introuvable.');
      }

      // Vérifie s’il existe déjà une responsabilité liée
      const existingResp = await this.memberResponsibilityRepo.findOne({
        where: { member_uuid: updated.uuid },
      });

      if (existingResp) {
        // Mise à jour
        existingResp.responsibility_uuid = dto.responsibility_uuid;
        existingResp.responsibility = responsibility;
        await this.memberResponsibilityRepo.save(existingResp);
      } else {
        // Création
        const memberResponsibility = this.memberResponsibilityRepo.create({
          member_uuid: updated.uuid,
          member: updated,
          responsibility_uuid: dto.responsibility_uuid,
          responsibility,
        });
        await this.memberResponsibilityRepo.save(memberResponsibility);
      }
    }

    //  Mise à jour des accessoires (si présents)
    if (dto.accessories && Array.isArray(dto.accessories)) {
      // Supprime les anciens accessoires du membre
      await this.memberAccessoryRepo.delete({ member_uuid: updated.uuid });

      // Ajoute les nouveaux
      for (const accessoryUuid of dto.accessories) {
        const accessory = await this.accessoryService.findOne(
          accessoryUuid,
          admin_uuid,
        );

        if (accessory) {
          const memberAccessory = this.memberAccessoryRepo.create({
            member_uuid: updated.uuid,
            member: updated,
            accessory_uuid: accessoryUuid,
            accessory,
          });
          await this.memberAccessoryRepo.save(memberAccessory);
        }
      }
    }

    // Journalisation
    await this.logService.logAction(
      'members-update',
      admin.id,
      `Mise à jour du membre ${updated.firstname} ${updated.lastname} (${updated.matricule})`,
    );

    return updated;
  }



  async findAll(admin_uuid: string): Promise<MemberEntity[]> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    const members = await this.memberRepo.find({
      relations: ['member_accessories'],
      order: { firstname: 'ASC' },
    });

    await this.logService.logAction(
      'members-findAll',
      admin.id,
      'Récupération de la liste complète des membres',
    );

    return members;
  }

  /** Trouver un membre par UUID */
async findOne(uuid: string, admin_uuid: string): Promise<MemberEntity> {
  const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
  if (!admin) {
    throw new NotFoundException("Identifiant de l'auteur introuvable");
  }

  const member = await this.memberRepo.findOne({
    where: { uuid },
    relations: [
      // Relations simples
      'civility',
      'marital_status',
      'country',
      'city',
      'formation',
      'job',
      'organisation_city',
      'department',
      'division',
      'structure',

      // Collections
      'member_accessories',
      'member_responsibilities',
    ],
  });

  if (!member) {
    throw new NotFoundException('Aucun membre trouvé avec cet identifiant.');
  }

  await this.logService.logAction(
    'members-findOne',
    admin.id,
    `Consultation du membre ${member.firstname} ${member.lastname}`,
  );

  return member;
}

  /** Suppression logique d’un membre */
  async delete(uuid: string, admin_uuid: string): Promise<void> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    const member = await this.memberRepo.findOne({ where: { uuid } });
    if (!member) throw new NotFoundException('Aucun membre trouvé à supprimer.');

    await this.memberRepo.softRemove(member);

    await this.logService.logAction(
      'members-delete',
      admin.id,
      `Suppression logique du membre ${member.firstname} ${member.lastname}`,
    );
  }
}
