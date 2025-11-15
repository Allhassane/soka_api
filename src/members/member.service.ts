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
import { UserService } from 'src/users/user.service';
import { ResponsibilityEntity } from 'src/responsibilities/entities/responsibility.entity';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { StructureService } from 'src/structure/structure.service';

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
    
    //@InjectRepository(ResponsibilityEntity)
    private readonly responsibilityService: ResponsibilityService,

    private readonly accessoryService: AccessoryService, 

    @InjectRepository(ResponsibilityEntity)
    private readonly responsibilityRepo: Repository<ResponsibilityEntity>,

  
    private readonly structureService: StructureService,

  ) {}


  async store(dto: CreateMemberDto, admin_uuid: string): Promise<MemberEntity> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    //  Vérification de la civilité
    if (!dto.civility_uuid) {
      throw new BadRequestException('Veuillez renseigner la civilité du membre.');
    }

    const civility = await this.civilityRepo.findOne({
      where: { uuid: dto.civility_uuid },
    });
    if (!civility) {
      throw new NotFoundException('Civilité introuvable.');
    }

    // Vérifier si le membre existe déjà (email ou téléphone)
const existingMember = await this.memberRepo.findOne({
  where: [
    { phone: dto.phone },
    { email: dto.email },
  ],
});

if (existingMember) {
  throw new BadRequestException(
    'Un membre avec ce numéro ou cet email existe déjà.'
  );
}

    //  Génération du matricule unique
    const lastMember = await this.memberRepo
      .createQueryBuilder('m')
      .orderBy('m.id', 'DESC')
      .getOne();

    const nextId = lastMember ? lastMember.id + 1 : 1;
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    const matricule = `${yearSuffix}-${String(nextId).padStart(4, '0')}`; // ex: 25-0007

    // Création et sauvegarde du membre
    const member = this.memberRepo.create({
      ...dto,
      matricule,
      gender: civility.gender,
      admin_uuid,
      status: dto.status ?? 'enable',
    });

    const saved = await this.memberRepo.save(member);

    // Création de la responsabilité du membre (si renseignée)
    if (dto.responsibility_uuid) {
      const responsibility = await this.responsibilityService.findOne(
        dto.responsibility_uuid,
        admin_uuid
      );

      if (!responsibility) {
        throw new NotFoundException('Responsabilité introuvable.');
      }

      const memberResponsibility = this.memberResponsibilityRepo.create({
        member_uuid: saved.uuid,
        member: saved,
        responsibility_uuid: dto.responsibility_uuid,
        responsibility,
        priority:'high'
      });

      await this.memberResponsibilityRepo.save(memberResponsibility);
    }

    //  Création des accessoires du membre (si présents)
    if (dto.accessories && dto.accessories.length > 0) {
      for (const accessoryUuid of dto.accessories) {
        const accessory = await this.accessoryService.findOne(
          accessoryUuid,
          admin_uuid
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

    //creation du compte utilisateur lié au membre
    if (saved) {
  // Vérifier si un compte existe déjà avec cet email ou numéro
  const existingUser = await this.userRepo.findOne({
    where: [
      { phone_number: saved.phone },
      { email: saved.email },
    ],
  });

  if (!existingUser) {
    // Générer un mot de passe temporaire
    let newUser: any = null;
    const tempPassword = Math.random().toString(36).slice(-8); // ex: kf8d2j3s

    const user = this.userRepo.create({
      firstname: saved.firstname,
      lastname: saved.lastname,
      email: saved.email,
      phone_number: saved.phone,
      password: tempPassword,
      is_active: true,
      member_uuid: saved.uuid,
      password_no_hashed: tempPassword,
    });

     newUser = await this.userRepo.save(user);

    await this.logService.logAction(
      'user-create-from-member',
      admin.id,
      `Compte utilisateur créé automatiquement pour ${saved.firstname} ${saved.lastname}`,
    );


    
  } else {
    await this.logService.logAction(
      'user-skip-existing',
      admin.id,
      `Utilisateur déjà existant pour ${saved.firstname} ${saved.lastname}`,
    );
    
  }
}

    // Journalisation
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

      /**
      * MISE À JOUR AUTO DU COMPTE UTILISATEUR LIÉ
   */
  const linkedUser = await this.userRepo.findOne({
    where: 
      { member_uuid : uuid }
  });

  if (linkedUser) {
    linkedUser.firstname = updated.firstname;
    linkedUser.lastname = updated.lastname;
    linkedUser.email = updated.email ?? linkedUser.email;
    linkedUser.phone_number = updated.phone ?? linkedUser.phone_number;

    await this.userRepo.save(linkedUser);

    // journalisation MAJ user
    await this.logService.logAction(
      'user-update-from-member',
      admin.id,
      `Compte utilisateur mis à jour automatiquement pour ${updated.firstname} ${updated.lastname}`,
    );
  }

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
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    const member = await this.memberRepo.findOne({
      where: { uuid },
      relations: ['member_accessories'],
    });

    if (!member) throw new NotFoundException('Aucun membre trouvé avec cet identifiant.');

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

  //liste des membres en fonction de l'utilisateur connecté
  async findAllMemberByUserConnected(member_uuid: string): Promise<MemberEntity[]> {
    //on verifie si le membre connecté est un responsable
    const memberResponsibility = await this.memberResponsibilityRepo.findOne({ where: { member_uuid: member_uuid, priority: 'high' } });
    if (!memberResponsibility) throw new NotFoundException("Identifiant de la responsabilité introuvable");
    //on recupere responsability_uuid si le membre connecté est un responsable
    const responsibility_uuid = memberResponsibility.responsibility_uuid;
    //req sur responsability
    const responsibility = await this.responsibilityRepo.findOne({ relations: ['level'], where: { uuid: responsibility_uuid } });
    if (!responsibility) throw new NotFoundException("Identifiant de la responsabilité introuvable");
  
    //on recupere les structures du level_uuid
    //const structures = await this.structureService.findOne({ level_uuid: responsibility.level_uuid });
    //if (!structures) throw new NotFoundException("Identifiant de la structure introuvable");
    //on recupere les membres de la structure concerné
    const members = await this.memberRepo.find({
      where: { structure_uuid: structures?.uuid },
      relations: ['member_accessories'],
      order: { firstname: 'ASC' },
    });
    if (!members) throw new NotFoundException("Aucun membre trouvé");
    return members;
  }


}
