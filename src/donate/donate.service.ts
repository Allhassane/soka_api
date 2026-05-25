import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DonateEntity } from './entities/donate.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateDonateDto } from './dto/create-donate.dto';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { UpdateDonateDto } from './dto/update-donate.dto';
import { PaymentService } from 'src/payments/payment.service';
import { MemberEntity } from 'src/members/entities/member.entity';
import { StructureService } from 'src/structure/structure.service';
import { DonatePaymentEntity } from 'src/donate-payment/entities/donate-payment.entity';

@Injectable()
export class DonateService {
  constructor(
    @InjectRepository(DonateEntity)
    private readonly donateRepo: Repository<DonateEntity>,
    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,

    @InjectRepository(DonatePaymentEntity)
    private readonly donatePaymentRepo: Repository<DonatePaymentEntity>,
    private readonly structureService: StructureService,
  ) { }

  async findAll(admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'donate-findAll',
      admin.id,
      'recupération de la liste de tous les dons'
    );

    return this.donateRepo.find();
  }

  async findOneByUuid(uuid: string, admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const donate = await this.donateRepo.findOne({ where: { uuid } });
    if (!donate) {
      throw new NotFoundException('Don introuvable');
    }

    // Journalisation
    await this.logService.logAction(
      'donate-findOne',
      admin.id,
      `Consultation du don "${donate.name}"`,
    );

    return donate;
  }


  async findOne(
  uuid: string,
  admin_uuid: string,
  member_uuid: string,
  structure_uuid: string,
) {
  // Vérifier l'admin
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

  // Récupérer la donation
  const donate = await this.donateRepo.findOne({ where: { uuid } });
  if (!donate) {
    throw new NotFoundException('Don introuvable');
  }


  // Vérifier structure_uuid
  if (!structure_uuid) {
    return donate;
    //throw new NotFoundException('Structure introuvable.');
  }

  // Récupérer les sous-groupes du responsable
  const sousGroups = await this.structureService.findByAllChildrens(structure_uuid);

  // Calculer les statistiques pour cette donation
  let total_campaign_amount = 0;
  let total_successful_payments = 0;
  let total_successful_amount = 0;
  let total_members_donated = 0;

  // Total de la campagne de donation (global)
  const campaignSum = await this.donatePaymentRepo
    .createQueryBuilder('dp')
    .select('SUM(dp.amount)', 'sum')
    .where('dp.donate_uuid = :donate_uuid', { donate_uuid: donate.uuid })
    .andWhere('dp.status = :status', { status: GlobalStatus.SUCCESS })
    .getRawOne();

  total_campaign_amount = Number(campaignSum?.sum ?? 0);

  // Statistiques pour les sous-groupes du responsable
  const responsibleStats = await this.donatePaymentRepo
    .createQueryBuilder('dp')
    .innerJoin('payments', 'p', 'p.uuid = dp.payment_uuid')
    .innerJoin('members', 'actor', 'actor.uuid = p.actor_uuid')
    .select('COUNT(DISTINCT dp.uuid)', 'count')
    .addSelect('SUM(dp.amount)', 'sum')
    .addSelect('COUNT(DISTINCT actor.uuid)', 'members_count')
    .where('dp.donate_uuid = :donate_uuid', { donate_uuid: donate.uuid })
    .andWhere('dp.status = :status', { status: GlobalStatus.SUCCESS })
    .andWhere('actor.structure_uuid IN (:...groups)', { groups: sousGroups })
    .getRawOne();

  total_successful_payments = Number(responsibleStats?.count ?? 0);
  total_successful_amount = Number(responsibleStats?.sum ?? 0);
  total_members_donated = Number(responsibleStats?.members_count ?? 0);

  // Journalisation
  await this.logService.logAction(
    'donate-findOne',
    admin.id,
    `Consultation du don "${donate.name}"`,
  );

  return {
    ...donate,
    statistics: {
      total_campaign_amount,
      total_successful_payments,
      total_successful_amount,
      total_members_donated,
      root_structure_uuid: structure_uuid,
      sous_groups_count: sousGroups.length,
    },
  };
}

  async create(createDonateDto: CreateDonateDto, admin_uuid: string) {
    // Vérification de l'admin
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    // Validation business
    if (
      createDonateDto.category === 'fixed_amount' &&
      (createDonateDto.amount == null || createDonateDto.amount <= 0)
    ) {
      throw new NotFoundException(
        "Le montant de don est obligatoire pour la catégorie à montant fixe"
      );
    }

    // Historique
    const history = {
      action: "Création d'un don",
      table: "donates",
      event: "donate-store",
      performed_by: `${admin.firstname} ${admin.lastname}`,
      admin_uuid,
      payload: {
        name: createDonateDto.name,
        category: createDonateDto.category,
        amount: createDonateDto.amount ?? null,
        starts_at: createDonateDto.starts_at,
        stops_at: createDonateDto.stops_at,
      },
      performed_at: new Date(),
    };

    const check_donate = await this.donateRepo.findOne({ where: { name: createDonateDto.name, starts_at: createDonateDto.starts_at, stops_at: createDonateDto.stops_at, category: createDonateDto.category }});

    if(check_donate){
      console.log('donate existe');
      return check_donate;
    }

    // Enregistrement
    const saved = await this.donateRepo.save({
      ...createDonateDto,
      status: GlobalStatus.STARTED,
      history: JSON.stringify(history),
      admin_uuid,
    });

    // Journalisation
    await this.logService.logAction(
      'donate-store',
      admin.id,
      `Création du don "${createDonateDto.name}" par ${admin.firstname} ${admin.lastname}`
    );

    return saved;
  }


  async update(uuid: string, updateDonateDto: UpdateDonateDto, admin_uuid: string) {

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const donate = await this.donateRepo.findOne({ where: { uuid } });
    if (!donate) {
      throw new NotFoundException("Don introuvable");
    }

    Object.assign(donate, {
      ...updateDonateDto,
      updated_at: new Date(),
    });

    const historyEntry = {
      action: "Mise à jour d'un don",
      table_action: "donate-update",
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: updateDonateDto,
      admin_uuid,
      performed_at: new Date(),
    };

    let historyArray: any[] = [];
    if (donate.history) {
      try {
        historyArray = JSON.parse(donate.history);
        if (!Array.isArray(historyArray)) historyArray = [historyArray];
      } catch {
        historyArray = [];
      }
    }
    historyArray.push(historyEntry);
    donate.history = JSON.stringify(historyArray);

    const updated = await this.donateRepo.save(donate);

    // Journalisation
    await this.logService.logAction(
      'donate-update',
      admin.id,
      `Mise à jour du don "${updated.name}" par ${admin.firstname} ${admin.lastname}`,
    );

    return updated;
  }

  async changeStatus(uuid: string, status: GlobalStatus, admin_uuid: string) {
    // Vérification de l'administrateur
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    // Vérification de l'abonnement existant
    const donate = await this.donateRepo.findOne({ where: { uuid } });
    if (!donate) {
      throw new NotFoundException('Don introuvable');
    }

    // Validation du statut selon GlobalStatus
    const allowedStatuses = Object.values(GlobalStatus);
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(
        `Statut invalide. Valeurs autorisées : ${allowedStatuses.join(', ')}`
      );
    }

    // Mise à jour du statut
    donate.status = status;
    donate.updated_at = new Date();

    // Ajout d'une trace dans l'historique
    const historyEntry = {
      action: `Changement de statut en "${status}"`,
      table_action: 'donate-status-change',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      admin_uuid,
      performed_at: new Date(),
    };

    let historyArray: any[] = [];
    if (donate.history) {
      try {
        historyArray = JSON.parse(donate.history);
        if (!Array.isArray(historyArray)) historyArray = [historyArray];
      } catch {
        historyArray = [];
      }
    }

    historyArray.push(historyEntry);
    donate.history = JSON.stringify(historyArray);

    const updated = await this.donateRepo.save(donate);

    // Journalisation
    await this.logService.logAction(
      'donate-status-change',
      admin.id,
      `Changement du statut de "${updated.name}" en "${status}" par ${admin.firstname} ${admin.lastname}`
    );

    return updated;
  }

  async delete(uuid: string, admin_uuid: string) {
    const donate = await this.donateRepo.findOne({ where: { uuid } });

    if (!donate) {
      throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'subscription-delete',
      admin.id,
      "Suppression du don " + donate.name + " par " + admin.firstname + " " + admin.lastname + " pour uuid " + donate.uuid,
    );

    return await this.donateRepo.softRemove(donate);
  }

}
