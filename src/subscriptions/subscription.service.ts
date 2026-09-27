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
import { AccessScopeService } from 'src/access-scope/access-scope.service';
import { PaymentEntity } from 'src/payments/entities/payment.entity';
import { chiffresReussis } from 'src/payments/campaign-payments-figures';
import { buildPaginationMeta } from 'src/shared/helpers/pagination-meta.helper';
import { PaginateMeta } from 'src/shared/interfaces/paginate-meta.interface';

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
    /** Périmètre canonique (service `@Global`) : borne les chiffres financiers de la fiche. */
    private readonly accessScopeService: AccessScopeService,
  ) {}

  /**
   * ACTION PRIORITAIRE « Abonnements » : campagnes OUVERTES que l'utilisateur
   * connecté n'a pas encore souscrites.
   *  - ouverte = statut STARTED et date du jour dans [starts_at, stops_at] ;
   *  - « non souscrite » = aucun paiement RÉUSSI où le membre est bénéficiaire.
   */
  async getOpenToSubscribe(user_uuid: string) {
    const user = await this.userRepo.findOne({ where: { uuid: user_uuid } });
    if (!user) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    const memberUuid = user.member_uuid ?? null;
    const now = new Date();

    const open = await this.subscriptionRepo
      .createQueryBuilder('s')
      .where('s.status = :status', { status: GlobalStatus.STARTED })
      .andWhere('s.starts_at <= :now', { now })
      .andWhere('s.stops_at >= :now', { now })
      .orderBy('s.stops_at', 'ASC')
      .getMany();

    // Unités déjà réglées par le membre (bénéficiaire) sur chaque campagne.
    // ⚠️ On somme `quantity`, on ne compte pas les lignes : un paiement peut porter
    // plusieurs unités, et c'est la quantité que l'enforcement compare au plafond
    // (`subscription-payment.service.makeSubscription`). Compter les lignes rouvrait
    // la campagne à un membre ayant déjà consommé tout son quota en une fois.
    const paidCount = new Map<string, number>();
    if (memberUuid && open.length) {
      const paid = await this.subscriptionPaymentRepo.find({
        where: {
          beneficiary_uuid: memberUuid,
          status: GlobalStatus.SUCCESS,
        },
        select: ['subscription_uuid', 'quantity'],
      });
      for (const p of paid) {
        paidCount.set(
          p.subscription_uuid,
          (paidCount.get(p.subscription_uuid) ?? 0) + (p.quantity ?? 1),
        );
      }
    }

    // On garde la campagne tant que le membre n'a pas atteint sa limite de
    // paiements. max null ou <= 0  ⇒  illimité (toujours proposé). Aligné sur
    // l'enforcement au paiement (subscription-payment.service : unités >= max).
    const campaigns = open
      .filter((s) => {
        const max = s.max_payments_per_beneficiary;
        if (!max || max <= 0) return true;
        return (paidCount.get(s.uuid) ?? 0) < max;
      })
      .map((s) => ({
        uuid: s.uuid,
        name: s.name,
        year: s.year,
        amount: s.amount,
        starts_at: s.starts_at,
        stops_at: s.stops_at,
        max_payments_per_beneficiary: s.max_payments_per_beneficiary,
      }));

    return { campaigns, total: campaigns.length };
  }

  async findAll(
    admin_uuid: string,
    page = 1,
    limit = 10,
    search?: string,
    /** Statut déjà résolu par le contrôleur (`null` = tous). */
    statut?: string | null,
  ): Promise<{ data: SubscriptionEntity[]; meta: Omit<PaginateMeta, 'page'> }> {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });

    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const qb = this.subscriptionRepo
      .createQueryBuilder('subscription')
      .orderBy('subscription.name', 'DESC');

    if (search?.trim()) {
      qb.andWhere('subscription.name LIKE :search', {
        search: `%${search.trim()}%`,
      });
    }

    // Filtre de statut. `undefined` ne devrait pas arriver (le contrôleur résout toujours), mais
    // on retombe alors sur le défaut « en cours » plutôt que d'ouvrir la liste entière.
    const statutApplique = statut === undefined ? 'started' : statut;
    if (statutApplique !== null) {
      qb.andWhere('subscription.status = :statut', { statut: statutApplique });
    }

    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    await this.logService.logAction(
      'subscriptions-findAll',
      admin.id,
      'recupération de la liste de tous les formations',
    );

    return {
      data,
      meta: buildPaginationMeta({ total, page, perPage: limit }),
    };
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


  /**
   * Détail d'une campagne d'abonnement, avec - pour qui a le droit de les voir - les chiffres
   * « Montant récolté » / « Paiements réussis » de SON périmètre.
   *
   * 🚨 RESPO-COMPTA-REGUL (2026-09-27) : ces chiffres sont ceux de la Comptabilité
   * (`chiffresReussis` : `payments.payment_status = 'paid'`, `total_amount`), bornés au périmètre
   * CANONIQUE (`perimetreFinancier`) par la structure du bénéficiaire. Avant : racine
   * `responsibilities[0]`, sous-groupes seuls, payeur, ligne métier - la somme des régions tombait
   * 35 paiements / 540 000 F sous le chiffre comptable.
   *
   * @param avecStatistiques le droit `abonnements_consulter_statistiques_campagne` (vérifié par le
   *   contrôleur) : sans lui, la campagne seule, sans clé `statistics`.
   */
  async findOne(
  uuid: string,
  admin_uuid: string,
  member_uuid: string,
  avecStatistiques: boolean,
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

  await this.logService.logAction(
    'subscriptions-findOne',
    admin.id,
    `Consultation de l'abonnement "${subscription.name || subscription.uuid}"`,
  );

  if (!avecStatistiques) return subscription;

  const perimetre = await this.accessScopeService.perimetreFinancier(admin_uuid);
  const paiements = this.subscriptionPaymentRepo.manager.getRepository(PaymentEntity);
  const [dansPerimetre, campagne] = await Promise.all([
    chiffresReussis(paiements, subscription.uuid, perimetre.structures),
    chiffresReussis(paiements, subscription.uuid, null),
  ]);

  return {
    ...subscription,
    statistics: {
      total_campaign_amount: campagne.montant, // Montant global de la campagne
      total_successful_payments: dansPerimetre.nombre, // Paiements réussis du périmètre
      total_successful_amount: dansPerimetre.montant, // Montant réussi du périmètre
      total_members_subscribed: dansPerimetre.beneficiaires, // Bénéficiaires distincts
      root_structure_uuid: perimetre.racine_uuid, // null = global (admin, national)
      // Nombre de structures du périmètre (tous niveaux) ; null = global.
      sous_groups_count: perimetre.structures ? perimetre.structures.size : null,
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
        max_payments_per_beneficiary: payload.max_payments_per_beneficiary ?? 1,
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

    const paymentCount = await this.subscriptionPaymentRepo.count({
      where: { subscription_uuid: subscription.uuid },
    });

    if (paymentCount > 0) {
      throw new BadRequestException(
        'Impossible de modifier cet abonnement : au moins un paiement existe déjà pour cette campagne.',
      );
    }

    Object.assign(subscription, {
      ...payload,
      max_payments_per_beneficiary: payload.max_payments_per_beneficiary ?? 1,
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
