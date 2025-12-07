import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionEntity } from './entities/subscription.entity';
import { LogActivitiesService } from '../log-activities/log-activities.service';
import { User } from '../users/entities/user.entity';
import { CreateSubscriptionDto } from './dto/create-subscription.dto';
import { UpdateSubscriptionDto } from './dto/update-subscription.dto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { StructureService } from 'src/structure/structure.service';

@Injectable()
export class SubscriptionService {
  constructor(
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionRepo: Repository<SubscriptionEntity>,
    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(SubscriptionPaymentEntity)
    private readonly subscriptionPaymentRepo: Repository<SubscriptionPaymentEntity>,
    private readonly structureService: StructureService,
  ) {}

  async findAll(admin_uuid: string) {
    const subscription = await this.subscriptionRepo.find({
      order: { name: 'DESC' },
    });

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'subscriptions-findAll',
      admin.id,
      'recupération de la liste de tous les formations'
    );

    return subscription;
  }


  async findOneByUuid(uuid: string,admin_uuid) {
    const subscription = await this.subscriptionRepo.findOne({ where: { uuid } });

    if (!subscription) {
        throw new NotFoundException('Aucune abonnement trouvé');
    }
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'subscriptions-findOne',
      admin.id,
      'Recupérer un division'
    );

    return subscription;
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

  // Récupérer la subscription
  const subscription = await this.subscriptionRepo.findOne({ where: { uuid } });
  if (!subscription) {
    throw new NotFoundException('Aucun abonnement trouvé');
  }

  // Vérifier structure_uuid
  if (!structure_uuid) {
    // Journalisation
    await this.logService.logAction(
      'subscriptions-findOne',
      admin.id,
      `Consultation de l'abonnement "${subscription.name || subscription.uuid}"`,
    );

    return subscription;
  }

  // Récupérer les sous-groupes du responsable
  const sousGroups = await this.structureService.findByAllChildrens(structure_uuid);

  // Calculer les statistiques pour cet abonnement
  let total_campaign_amount = 0;
  let total_successful_payments = 0;
  let total_successful_amount = 0;
  let total_members_subscribed = 0;

  // Total de la campagne d'abonnement (global)
  const campaignSum = await this.subscriptionPaymentRepo
    .createQueryBuilder('sp')
    .select('SUM(sp.amount)', 'sum')
    .where('sp.subscription_uuid = :subscription_uuid', { subscription_uuid: subscription.uuid })
    .andWhere('sp.status = :status', { status: GlobalStatus.SUCCESS })
    .getRawOne();

  total_campaign_amount = Number(campaignSum?.sum ?? 0);

  // Statistiques pour les sous-groupes du responsable
  const responsibleStats = await this.subscriptionPaymentRepo
    .createQueryBuilder('sp')
    .innerJoin('payments', 'p', 'p.uuid = sp.payment_uuid')
    .innerJoin('members', 'actor', 'actor.uuid = p.actor_uuid')
    .select('COUNT(DISTINCT sp.uuid)', 'count')
    .addSelect('SUM(sp.amount)', 'sum')
    .addSelect('COUNT(DISTINCT actor.uuid)', 'members_count')
    .where('sp.subscription_uuid = :subscription_uuid', { subscription_uuid: subscription.uuid })
    .andWhere('sp.status = :status', { status: GlobalStatus.SUCCESS })
    .andWhere('actor.structure_uuid IN (:...groups)', { groups: sousGroups })
    .getRawOne();

  total_successful_payments = Number(responsibleStats?.count ?? 0);
  total_successful_amount = Number(responsibleStats?.sum ?? 0);
  total_members_subscribed = Number(responsibleStats?.members_count ?? 0);

  // Journalisation
  await this.logService.logAction(
    'subscriptions-findOne',
    admin.id,
    `Consultation de l'abonnement "${subscription.name || subscription.uuid}"`,
  );

  return {
    ...subscription,
    statistics: {
      total_campaign_amount, // Montant global de la campagne
      total_successful_payments, // Nombre de paiements réussis (sous-groupes)
      total_successful_amount, // Montant total réussi (sous-groupes)
      total_members_subscribed, // Nombre de membres uniques ayant souscrit
      root_structure_uuid: structure_uuid,
      sous_groups_count: sousGroups.length,
    },
  };
}

    async store(payload: CreateSubscriptionDto, admin_uuid: string) {

      if (!payload?.name) {
        throw new BadRequestException('Veuillez renseigner tous les champs obligatoires.');
      }

      const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
      if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
      }

      const history = {
        action: "Création d'un abonnement",
        table_action: "subscription-store",
        performed_by: `${admin.firstname} ${admin.lastname}`,
        data: payload,
        admin_uuid: admin_uuid,
        performed_at: new Date(),
      };

      const newSubscription = this.subscriptionRepo.create({
        ...payload,
        admin_uuid,
        status:GlobalStatus.STARTED,
        history: JSON.stringify(history),
      });

      const saved = await this.subscriptionRepo.save(newSubscription);

      // Journalisation
      await this.logService.logAction(
        'subscription-store',
        admin.id,
        `Création de l’abonnement "${saved.name}" par ${admin.firstname} ${admin.lastname}`
      );

      return saved;
    }

    async update(uuid: string, payload: UpdateSubscriptionDto, admin_uuid: string) {

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const subscription = await this.subscriptionRepo.findOne({ where: { uuid } });
    if (!subscription) {
      throw new NotFoundException("Abonnement introuvable");
    }

    Object.assign(subscription, {
      ...payload,
      admin_uuid: admin_uuid,
      updated_at: new Date(),
    });

    // Création d'une nouvelle entrée d'historique
    const historyEntry = {
      action: "Mise à jour d'un abonnement",
      table_action: "subscription-update",
      performed_by: `${admin.firstname} ${admin.lastname}`,
      data: payload,
      admin_uuid,
      performed_at: new Date(),
    };

    // Ajout à l'historique existant (s’il existe déjà)
    let historyArray: any[] = [];
    if (subscription.history) {
      try {
        historyArray = JSON.parse(subscription.history);
        if (!Array.isArray(historyArray)) historyArray = [historyArray];
      } catch {
        historyArray = [];
      }
    }
    historyArray.push(historyEntry);
    subscription.history = JSON.stringify(historyArray);

    const updated = await this.subscriptionRepo.save(subscription);

    // Journalisation
    await this.logService.logAction(
      'subscriptions-update',
      admin.id,
      `Mise à jour de l’abonnement "${updated.name}" par ${admin.firstname} ${admin.lastname}`
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
    const subscription = await this.subscriptionRepo.findOne({ where: { uuid } });
    if (!subscription) {
      throw new NotFoundException('Abonnement introuvable');
    }

    // Validation du statut selon GlobalStatus
    const allowedStatuses = Object.values(GlobalStatus);
    if (!allowedStatuses.includes(status)) {
      throw new BadRequestException(
        `Statut invalide. Valeurs autorisées : ${allowedStatuses.join(', ')}`
      );
    }

    // Mise à jour du statut
    subscription.status = status;
    subscription.updated_at = new Date();

    // Ajout d'une trace dans l'historique
    const historyEntry = {
      action: `Changement de statut en "${status}"`,
      table_action: 'subscription-status-change',
      performed_by: `${admin.firstname} ${admin.lastname}`,
      admin_uuid,
      performed_at: new Date(),
    };

    let historyArray: any[] = [];
    if (subscription.history) {
      try {
        historyArray = JSON.parse(subscription.history);
        if (!Array.isArray(historyArray)) historyArray = [historyArray];
      } catch {
        historyArray = [];
      }
    }

    historyArray.push(historyEntry);
    subscription.history = JSON.stringify(historyArray);

    const updated = await this.subscriptionRepo.save(subscription);

    // Journalisation
    await this.logService.logAction(
      'subscription-status-change',
      admin.id,
      `Changement du statut de "${updated.name}" en "${status}" par ${admin.firstname} ${admin.lastname}`
    );

    return updated;
  }

  async delete(uuid: string,admin_uuid:string) {
    const subscription = await this.subscriptionRepo.findOne({ where: { uuid } });

    if (!subscription) {
        throw new NotFoundException('Aucun élément trouvé');
    }

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
        throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'subscription-delete',
      admin.id,
      "Suppression de l'abonnement "+subscription.name+" par "+admin.firstname+" "+admin.lastname+" pour uuid "+subscription.uuid,
    );

   return await this.subscriptionRepo.softRemove(subscription);

  }
}
