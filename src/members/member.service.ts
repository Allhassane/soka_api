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
  ) {}

  /** 🔹 Liste de tous les membres */
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

  /** Créer un nouveau membre */
  async store(dto: CreateMemberDto, admin_uuid: string): Promise<MemberEntity> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    // Étape 1 : Vérification de la civilité
    if (!dto.civility_uuid) {
      throw new BadRequestException('Veuillez renseigner la civilité du membre.');
    }

    const civility = await this.civilityRepo.findOne({
      where: { uuid: dto.civility_uuid },
    });

    if (!civility) {
      throw new NotFoundException('Civilité introuvable.');
    }
    // Générer un matricule unique

    const lastMember = await this.memberRepo
      .createQueryBuilder('m')
      .orderBy('m.id', 'DESC')
      .getOne();

    const nextId = lastMember ? lastMember.id + 1 : 1;
    const yearSuffix = new Date().getFullYear().toString().slice(-2);
    const matricule = `${yearSuffix}-${String(nextId).padStart(4, '0')}`; // ex: 25-0007

    // Création du membre
    const member = this.memberRepo.create({
      ...dto,
      matricule,
      gender:civility.gender,
      admin_uuid,
      status: dto.status ?? 'enable',
    });

    const saved = await this.memberRepo.save(member);

    // Journalisation
    await this.logService.logAction(
      'members-store',
      admin.id,
      `Création du membre ${saved.firstname} ${saved.lastname} (${saved.matricule})`,
    );

    return saved;
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

  /**  Mettre à jour un membre */
  async update(
    uuid: string,
    dto: UpdateMemberDto,
    admin_uuid: string,
  ): Promise<MemberEntity> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    const existing = await this.memberRepo.findOne({ where: { uuid } });
    if (!existing) throw new NotFoundException('Aucun membre correspondant trouvé.');

    Object.assign(existing, dto);

    const updated = await this.memberRepo.save(existing);

    await this.logService.logAction(
      'members-update',
      admin.id,
      `Mise à jour du membre ${updated.firstname} ${updated.lastname}`,
    );

    return updated;
  }

  /** Suppression logique d’un membre */
  async delete(uuid: string, admin_uuid: string): Promise<void> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");

    const member = await this.memberRepo.findOne({ where: { uuid } });
    if (!member) throw new NotFoundException('Aucun membre trouvé à supprimer.');

    await this.memberRepo.softRemove(member);

    await this.logService.logAction(
      'members-softDelete',
      admin.id,
      `Suppression logique du membre ${member.firstname} ${member.lastname}`,
    );
  }
}
