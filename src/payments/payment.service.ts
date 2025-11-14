import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { PaymentEntity } from './entities/payment.entity';
import { CreatePaymentDto, PaymentSource } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';

import { MemberEntity } from 'src/members/entities/member.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { DonateEntity } from '../donate/entities/donate.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { User } from 'src/users/entities/user.entity';
import { CinetPayService } from './cinetpay.service';

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

    @InjectRepository(User)
    private userRepo: Repository<User>,

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
  );

  // ------------------------------------------------------
  //  SAUVEGARDE DU PAIEMENT
  // ------------------------------------------------------
  const payment = this.paymentRepo.create({
    ...dto,
    total_amount: total,
    transaction_id: transactionId,
    payment_url: cinetResponse.payment_url,
    payment_status: GlobalStatus.PENDING,
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
}
