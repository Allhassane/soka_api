import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PaymentEntity, PaymentStatus } from './entities/payment.entity';
import { CreatePaymentDto, PaymentSource } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

import { MemberEntity } from 'src/members/entities/member.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { DonateEntity } from '../donate/entities/donate.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { User } from 'src/users/entities/user.entity';
import { CinetPayService } from './cinetpay.service';
import { StructureEntity } from 'src/structure/entities/structure.entity';
import { StructureService } from 'src/structure/structure.service';
import { DonatePaymentEntity } from 'src/donate-payment/entities/donate-payment.entity';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { TransactionWithDetails } from './types/transaction-with-details.type';
import axios from 'axios';

@Injectable()
export class PaymentService {
  constructor(
    @InjectRepository(PaymentEntity)
    private paymentRepo: Repository<PaymentEntity>,

    @InjectRepository(MemberEntity)
    private memberRepo: Repository<MemberEntity>,

    @InjectRepository(SubscriptionEntity)
    private subscriptionRepo: Repository<SubscriptionEntity>,

    @InjectRepository(DonateEntity)
    private donationRepo: Repository<DonateEntity>,

    @InjectRepository(DonatePaymentEntity)
    private donatePaymentRepo: Repository<DonatePaymentEntity>,

    @InjectRepository(SubscriptionPaymentEntity)
    private subscriptionPaymentRepo: Repository<SubscriptionPaymentEntity>,




    @InjectRepository(User)
    private userRepo: Repository<User>,

    private structureService: StructureService,


    private readonly logService: LogActivitiesService,
    private readonly cinetPayService:CinetPayService
  ) {}

  // ----------------------------------------------------------
  //  LISTER LES PAIEMENTS
  // ----------------------------------------------------------
  async findAll(admin_uuid: string, source?: PaymentSource) {
    const query = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.beneficiary', 'beneficiary')
      .leftJoinAndSelect('p.actor', 'actor')
      .orderBy('p.created_at', 'DESC');

    if (source) query.andWhere('p.source = :source', { source });

    return await query.getMany();
  }

  // ----------------------------------------------------------
  //  TROUVER UN PAIEMENT
  // ----------------------------------------------------------
  async findOne(uuid: string, admin_uuid: string): Promise<PaymentEntity> {
    const payment = await this.paymentRepo.findOne({
      where: { uuid },
      relations: ['beneficiary', 'actor'],
    });

    if (!payment)
      throw new NotFoundException('Paiement introuvable.');

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    await this.logService.logAction(
      'payments-findOne',
      admin.id,
      `Consultation du paiement ${uuid}`,
    );

    return payment;
  }

  // ----------------------------------------------------------
  // CRÉER UN PAIEMENT
  // ----------------------------------------------------------
  async store(dto: CreatePaymentDto, admin_uuid: string): Promise<any> {

    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    // --- Vérifier si le bénéficiaire existe ---
    const beneficiary = await this.memberRepo.findOne({ where: { uuid: dto.beneficiary_uuid } });
    if (!beneficiary)
      throw new NotFoundException('Bénéficiaire introuvable.');

    // --- Vérifier l'acteur ---
    const actor = await this.memberRepo.findOne({ where: { uuid: dto.actor_uuid } });
    if (!actor)
      throw new NotFoundException('Acteur introuvable.');

    let unitAmount = dto.amount ?? 0;

    // ------------------------------------------------------
    //  SOURCE : DONATION
    // ------------------------------------------------------
    if (dto.source === PaymentSource.DONATION) {
      const campaign = await this.donationRepo.findOne({ where: { uuid: dto.source_uuid } });

      if (!campaign)
        throw new NotFoundException("Campagne de don introuvable.");

      if (!dto.amount)
        throw new BadRequestException("Le montant du don est requis.");
    }

    // ------------------------------------------------------
    //  SOURCE : SUBSCRIPTION
    // ------------------------------------------------------
    if (dto.source === PaymentSource.SUBSCRIPTION) {
      const subscription = await this.subscriptionRepo.findOne({ where: { uuid: dto.source_uuid } });

      if (!subscription)
        throw new NotFoundException("Abonnement introuvable.");

      unitAmount = subscription.amount;
    }

    // ------------------------------------------------------
    //  CALCUL TOTAL
    // ------------------------------------------------------
    const quantity = dto.quantity ?? 1;
    const total = unitAmount * quantity;

    // ------------------------------------------------------
    //  INTÉGRATION CINETPAY
    // ------------------------------------------------------

    // Transaction unique
    const transactionId = `TRX-${Date.now()}-${Math.floor(Math.random() * 9999)}`;

    // Description lisible dans le dashboard CinetPay
    const description = `Paiement ${dto.source} par ${dto.actor_name}`;


   // Appel API CinetPay
    const cinetResponse = await this.cinetPayService.initPayment(
      total,
      description,
      transactionId,
      {
        id: beneficiary.uuid,
        name: beneficiary.firstname,
        surname: beneficiary.lastname,
        email: beneficiary.email ?? '',
        phone: beneficiary.phone ?? '',
      }
    );


    // ------------------------------------------------------
    //  SAUVEGARDE DU PAIEMENT
    // ------------------------------------------------------
    const payment = this.paymentRepo.create({
      ...dto,
      total_amount: total,
      transaction_id: transactionId,
      payment_url: cinetResponse.payment_url,
    });

    const saved = await this.paymentRepo.save(payment);

    await this.logService.logAction(
      'payments-store',
      admin.id,
      `Paiement initialisé (${saved.uuid})`,
    );

    // FRONT doit rediriger l'utilisateur vers cette URL
    return {
      message: "Paiement initié avec succès.",
      payment_uuid: saved.uuid,
      transaction_id: transactionId,
      amount: total,
      payment_url: cinetResponse.payment_url,
    };
  }


  // ----------------------------------------------------------
  //  METTRE À JOUR
  // ----------------------------------------------------------
  async update(uuid: string, dto: UpdatePaymentDto, admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    const payment = await this.paymentRepo.findOne({ where: { uuid } });
    if (!payment) throw new NotFoundException("Paiement introuvable.");

    Object.assign(payment, dto);

    // recalcul total
    if (dto.amount || dto.quantity) {
      const qty = dto.quantity ?? payment.quantity ?? 1;
      const amount = dto.amount ?? payment.amount ?? 0;
      payment.total_amount = qty * amount;
    }

    return await this.paymentRepo.save(payment);
  }

  // ----------------------------------------------------------
  //  CHANGER STATUT
  // ----------------------------------------------------------
  async changeStatus(uuid: string, status: GlobalStatus, admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    const payment = await this.paymentRepo.findOne({ where: { uuid } });
    if (!payment) throw new NotFoundException("Paiement introuvable.");

    payment.status = status;

    await this.paymentRepo.save(payment);

    await this.logService.logAction(
      'payments-changeStatus',
      admin.id,
      `Statut du paiement ${uuid} changé en ${status}`,
    );

    return payment;
  }


  // ----------------------------------------------------------
  //  PAIEMENTS PAR MEMBRE
  // ----------------------------------------------------------
  async findByMember(member_uuid: string, admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    await this.logService.logAction(
      'payments-changeStatus',
      admin.id,
      `Paiement du membre ${member_uuid} changé`,
    );

    return this.paymentRepo.find({
      where: { beneficiary_uuid: member_uuid },
      order: { created_at: 'DESC' },
    });
  }

  // ----------------------------------------------------------
  //  STATISTIQUES GLOBALES
  // ----------------------------------------------------------
  async getStats(admin_uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }

    await this.logService.logAction(
      'payments-changeStatus',
      admin.id,
      `Statistique global`,
    );
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .select([
        'COUNT(*) as totalPayments',
        'SUM(p.total_amount) as totalAmount',
      ]);

    return await qb.getRawOne();
  }

  async findByTransactionIdOrFail(transaction_id: string, admin_uuid: string) {
    const payment = await this.paymentRepo.findOne({
      where: { transaction_id },
    });

    if (!payment) {
      throw new NotFoundException(
        `Aucun paiement trouvé pour transaction_id = ${transaction_id}`,
      );
    }

    return payment;
  }

  async updatePayment(uuid: string, data: Partial<PaymentEntity>) {
    const payment = await this.paymentRepo.findOne({ where: { uuid } });
    if (!payment) {
      throw new NotFoundException(`Paiement introuvable pour uuid=${uuid}`);
    }

    // Liste des champs autorisés
    const allowedFields = [
      'status',
      'payment_status',
      'payment_url',
      'transaction_id',
      'amount',
      'total_amount',
    ];

    for (const key of Object.keys(data)) {
      if (allowedFields.includes(key)) {
        (payment as any)[key] = (data as any)[key];
      }
    }

    return await this.paymentRepo.save(payment);
  }


  async findTransactionsForSubGroups(
    source_uuid: string,
    admin_uuid: string,
    page = 1,
    limit = 50,
  ) {


    const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
    if (!admin) {
      throw new NotFoundException("Identifiant de l'auteur introuvable");
    }
    const member = await this.memberRepo.findOne({ where: { uuid: admin.member_uuid } });

    if (!member) {
      throw new NotFoundException("Identifiant du membre introuvable");
    }
    const sousGroups = await this.structureService.findByAllChildrens(member?.structure_uuid);


    if (!sousGroups.length) {
      return {
        total: 0,
        page,
        limit,
        sous_groups: [],
        total_campaign_amount: 0,
        data: [],
      };
    }


    // 3) Query principale (paiements)
    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.actor', 'actor')
      .leftJoinAndSelect('actor.structure', 'actorStructure')
      .leftJoinAndSelect('p.beneficiary', 'beneficiary')
      .leftJoinAndSelect('beneficiary.structure', 'beneficiaryStructure')
      .where('p.source_uuid = :source_uuid', { source_uuid })
      .andWhere('actor.structure_uuid IN (:...groups)', { groups: sousGroups })
      .orderBy('p.created_at', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    const [payments, total] = await qb.getManyAndCount();

    let total_campaign_amount = 0;

    const samplePayment = await this.paymentRepo.findOne({
      where: { source_uuid },
    });

    if (samplePayment) {
      if (samplePayment.source === PaymentSource.DONATION) {
        const donationSum = await this.donatePaymentRepo
          .createQueryBuilder('d')
          .select('SUM(d.amount)', 'sum')
          .where('d.donate_uuid = :id', { id: source_uuid })
          .andWhere('d.status = :status', { status: GlobalStatus.SUCCESS })
          .getRawOne();

        total_campaign_amount = Number(donationSum?.sum ?? 0);
      }

      if (samplePayment.source === PaymentSource.SUBSCRIPTION) {
        const subscriptionSum = await this.subscriptionPaymentRepo
          .createQueryBuilder('s')
          .select('SUM(s.amount)', 'sum')
          .where('s.subscription_uuid = :id', { id: source_uuid })
          .andWhere('s.status = :status', { status: GlobalStatus.SUCCESS })
          .getRawOne();

        total_campaign_amount = Number(subscriptionSum?.sum ?? 0);
      }
    }


    const result: TransactionWithDetails[] = [];

    for (const p of payments) {
      let donation: DonatePaymentEntity | null = null;
      let subscription: SubscriptionPaymentEntity | null = null;

      if (p.source === PaymentSource.DONATION) {
        donation = await this.donatePaymentRepo.findOne({
          where: { payment_uuid: p.uuid },
        });
      }

      if (p.source === PaymentSource.SUBSCRIPTION) {
        subscription = await this.subscriptionPaymentRepo.findOne({
          where: { payment_uuid: p.uuid },
        });
      }

      result.push({
        payment_uuid: p.uuid,
        source: p.source,
        source_uuid: p.source_uuid,
        transaction_id: p.transaction_id,
        payment_status: p.payment_status,
        status: p.status,
        created_at: p.created_at,

        amount_unit: p.amount,
        quantity: p.quantity,
        total_amount: p.total_amount,

        actor: p.actor
          ? {
              uuid: p.actor.uuid,
              firstname: p.actor.firstname,
              lastname: p.actor.lastname,
              phone: p.actor.phone,
              structure: p.actor.structure
                ? { uuid: p.actor.structure.uuid, name: p.actor.structure.name }
                : null,
            }
          : null,

        beneficiary: p.beneficiary
          ? {
              uuid: p.beneficiary.uuid,
              firstname: p.beneficiary.firstname,
              lastname: p.beneficiary.lastname,
              phone: p.beneficiary.phone,
              structure: p.beneficiary.structure
                ? {
                    uuid: p.beneficiary.structure.uuid,
                    name: p.beneficiary.structure.name,
                  }
                : null,
            }
          : null,

        donation: donation
          ? {
              uuid: donation.uuid,
              amount: donation.amount,
              status: donation.status,
              quantity: donation.quantity,
            }
          : null,

        subscription: subscription
          ? {
              uuid: subscription.uuid,
              amount: subscription.amount,
              status: subscription.status,
              quantity: subscription.quantity,
            }
          : null,
      });
    }

    return {
      total,
      total_campaign_amount,
      page,
      limit,
      root_structure_uuid: member.structure_uuid,
      sous_groups: sousGroups,
      source_uuid,
      data: result,
    };
  }


  async confirmCinetPayCallback(payload: any) {
  const { transaction_id } = payload;

  if (!transaction_id) {
    throw new BadRequestException('transaction_id manquant.');
  }

  // Vérification côté CinetPay
  const check = await axios.post(
    'https://api-checkout.cinetpay.com/v2/payment/check',
    {
      transaction_id,
      apikey: process.env.CINET_API_KEY,
      site_id: process.env.CINET_SITE_ID,
    },
  );

  const response = check.data;

  if (response.code !== '00') {
    throw new BadRequestException(
      `Paiement refusé par CinetPay : ${response.message}`,
    );
  }


    // data existe
    if (!response.data) {
      throw new BadRequestException('Réponse CinetPay invalide : data manquant.');
    }


  // Paiement interne
      const payment = await this.paymentRepo.findOne({
        where: { transaction_id },
      });

      if (!payment) {
        throw new NotFoundException(
          `Aucun paiement trouvé pour transaction_id = ${transaction_id}`,
        );
    }

      // status = ACCEPTED
    if (response.data.status !== 'ACCEPTED') {
        await this.updatePayment(payment.uuid, {
          status: GlobalStatus.FAILED,
          payment_status: PaymentStatus.FAILED,
        });

        // Mise à jour éventuelle d’un don ou abonnement
        await this.updateLinkedEntities(payment,GlobalStatus.FAILED);

      throw new BadRequestException(
        `Paiement refusé : statut = ${response.data.status}`,
      );
    }else{
      await this.updatePayment(payment.uuid, {
        status: GlobalStatus.SUCCESS,
        payment_status: PaymentStatus.PAID,
      });

      await this.updateLinkedEntities(payment,GlobalStatus.SUCCESS);

      return payment;
    }
}


  private async updateLinkedEntities(payment: PaymentEntity,status) {
    const donation = await this.donatePaymentRepo.findOne({
      where: { payment_uuid: payment.uuid },
    });

    if (donation) {
      donation.status = status;
      await this.donatePaymentRepo.save(donation);

      console.log(`Don mis à jour pour paiement ${payment.uuid}`);
      return { updated: 'donation', uuid: donation.uuid };
    }

    const subscription = await this.subscriptionPaymentRepo.findOne({
      where: { payment_uuid: payment.uuid },
    });

    if (subscription) {
      subscription.status = status;
      await this.subscriptionPaymentRepo.save(subscription);

      console.log(`Abonnement mis à jour pour paiement ${payment.uuid}`);
      return { updated: 'subscription', uuid: subscription.uuid };
    }

    console.warn(
      ` Aucun Don ou Abonnement trouvé pour le paiement ${payment.uuid}`,
    );

    return { updated: null };
  }


}
