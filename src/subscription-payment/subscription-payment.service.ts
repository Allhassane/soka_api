import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionPaymentEntity } from './entities/subscription-payment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { MemberEntity } from 'src/members/entities/member.entity';
import { MakeSubscriptionPaymentDto } from './dto/make-subscription-payment';
import { PaymentSource } from 'src/payments/dto/create-payment.dto';
import { PaymentService } from 'src/payments/payment.service';
import axios from 'axios';
import { PaymentStatus } from 'src/payments/entities/payment.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';

@Injectable()
export class SubscriptionPaymentService {
  constructor(
    @InjectRepository(SubscriptionPaymentEntity)
    private readonly subscriptionPaymentRepo: Repository<SubscriptionPaymentEntity>,

    @InjectRepository(SubscriptionEntity)
    private readonly subscriptionCampaignRepo: Repository<SubscriptionEntity>,

    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,

    private readonly paymentService: PaymentService,
  ) { }

  // ============================================================
  // 1. INITIER UN PAIEMENT D’ABONNEMENT
  // ============================================================

  async makeSubscription(dto: MakeSubscriptionPaymentDto, admin_uuid: string) {
    const admin = await this.checkAdmin(admin_uuid);
    const beneficiary = await this.findMember(dto.beneficiary_uuid);
    const actor = await this.findMember(admin.member_uuid);
    const subscription = await this.findSubscription(dto.subscription_uuid);

    // -----------------------------------------
    // Vérifier période valide
    // -----------------------------------------
    const now = new Date();
    const start = new Date(subscription.starts_at);
    const stop = new Date(subscription.stops_at);

    if (now < start) {
      throw new BadRequestException(
        `Cette campagne d'abonnement n'est pas encore ouverte. Début : ${start.toLocaleDateString()}`,
      );
    }

    if (now > stop) {
      throw new BadRequestException(
        `Cette campagne d'abonnement est clôturée depuis le ${stop.toLocaleDateString()}.`,
      );
    }

    // -----------------------------------------
    // Vérifier quota de paiements
    // -----------------------------------------
    if (
      subscription.max_payments_per_beneficiary &&
      subscription.max_payments_per_beneficiary > 0
    ) {
      const totalPaid = await this.subscriptionPaymentRepo.count({
        where: {
          subscription_uuid: subscription.uuid,
          beneficiary_uuid: beneficiary.uuid,
        },
      });

      if (totalPaid >= subscription.max_payments_per_beneficiary) {
        throw new BadRequestException(
          `Limite de paiements atteinte pour ce bénéficiaire.`,
        );
      }
    }

    // -----------------------------------------
    // Quantité
    // -----------------------------------------
    const quantity = dto.quantity ?? 1;

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException(
        'La quantité doit être un entier >= 1.',
      );
    }

    // -----------------------------------------
    // Montant fixe
    // -----------------------------------------
    if (!subscription.amount || subscription.amount <= 0) {
      throw new BadRequestException(
        'Montant fixe de la campagne invalide.',
      );
    }

    const unitAmount = subscription.amount;
    const total = unitAmount * quantity;

    // -----------------------------------------
    // Paiement CinetPay via PaymentService
    // -----------------------------------------
    const paymentResult = await this.paymentService.store(
      {
        source: PaymentSource.SUBSCRIPTION,
        source_uuid: subscription.uuid,

        beneficiary_uuid: beneficiary.uuid,
        beneficiary_name: `${beneficiary.firstname} ${beneficiary.lastname}`,

        actor_uuid: actor.uuid,
        actor_name: `${actor.firstname} ${actor.lastname}`,

        amount: unitAmount,
        quantity,
      },
      admin_uuid,
    );

    // -----------------------------------------
    // Sauvegarde du paiement d'abonnement
    // -----------------------------------------
    const subscriptionPayment = this.subscriptionPaymentRepo.create({
      amount: total,
      quantity,

      subscription_uuid: subscription.uuid,

      beneficiary_uuid: beneficiary.uuid,
      beneficiary_name: `${beneficiary.firstname} ${beneficiary.lastname}`,

      actor_uuid: actor.uuid,
      actor_name: `${actor.firstname} ${actor.lastname}`,

      payment_uuid: paymentResult.payment_uuid,

      //status: GlobalStatus.PENDING,
    });

    const saved = await this.subscriptionPaymentRepo.save(subscriptionPayment);

    return {
      message: 'Paiement d’abonnement initié avec succès',
      //subscription_payment_uuid: saved.uuid,
      payment_uuid: paymentResult.payment_uuid,
      transaction_id: paymentResult.transaction_id,
      amount: total,
      payment_url: paymentResult.payment_url,
    };
  }


  async confirmPayment(payload: any, admin_uuid: string) {
    const { transaction_id } = payload;

    if (!transaction_id) {
      throw new BadRequestException(
        'transaction_id manquant dans le callback.',
      );
    }

    // --- Vérification CinetPay ---
    const check = await axios.post(
      'https://api-checkout.cinetpay.com/v2/payment/check',
      {
        transaction_id,
        apikey: process.env.CINET_API_KEY,
        site_id: process.env.CINET_SITE_ID,
      },
    );

    const data = check.data;

    if (data.code !== '00') {
      if (data.message === 'WAITING_CUSTOMER_PAYMENT' || data.message === 'WAITING_CUSTOMER_TO_VALIDATE') {
        throw new BadRequestException(
          `Le paiement est en attente de validation.`,
        );
      }

      else if (data.message === 'PAYMENT_FAILED') {
        // --- Récupération du paiement ---
        const payment = await this.paymentService.findByTransactionIdOrFail(
          transaction_id,
          admin_uuid
        );

        // --- Mise à jour du paiement ---
        await this.paymentService.updatePayment(payment.uuid, {
          status: GlobalStatus.FAILED,
          payment_status: PaymentStatus.FAILED,
        });

        // --- Mise à jour du paiement d'abonnement ---
        const subscriptionPayment = await this.subscriptionPaymentRepo.findOne({
          where: { payment_uuid: payment.uuid },
        });

        if (subscriptionPayment) {
          subscriptionPayment.status = GlobalStatus.FAILED;
          await this.subscriptionPaymentRepo.save(subscriptionPayment);
        }
        throw new BadRequestException(
          `Paiement échoué`,
        );
      }

      throw new BadRequestException(
        `Paiement non vérifié`,
      );
    }

    if (data.data.status !== 'ACCEPTED') {
      throw new BadRequestException(
        `Paiement refusé`,
      );
    }

    // --- Récupération du paiement ---
    const payment = await this.paymentService.findByTransactionIdOrFail(
      transaction_id,
      admin_uuid
    );

    // --- Mise à jour du paiement ---
    await this.paymentService.updatePayment(payment.uuid, {
      status: GlobalStatus.SUCCESS,
      payment_status: PaymentStatus.PAID,
    });

    // --- Mise à jour du paiement d'abonnement ---
    const subscriptionPayment = await this.subscriptionPaymentRepo.findOne({
      where: { payment_uuid: payment.uuid },
    });

    if (subscriptionPayment) {
      subscriptionPayment.status = GlobalStatus.SUCCESS;
      await this.subscriptionPaymentRepo.save(subscriptionPayment);
    }

    return {
      success: true,
      message: 'Paiement confirmé avec succès',
      transaction_id,
      subscription_payment_uuid: subscriptionPayment?.uuid ?? null,
    };
  }


  async findOne(uuid: string, admin_uuid: string) {
    // Vérifier l’admin
    await this.checkAdmin(admin_uuid);

    const payment = await this.subscriptionPaymentRepo.findOne({
      where: { uuid },
    });

    if (!payment) {
      throw new NotFoundException('Paiement d’abonnement introuvable.');
    }

    return payment;
  }


  async changeStatus(uuid: string, status: GlobalStatus, admin_uuid: string) {
    // Vérifier l’admin
    await this.checkAdmin(admin_uuid);

    // Récupérer l’enregistrement
    const payment = await this.subscriptionPaymentRepo.findOne({
      where: { uuid },
    });

    if (!payment) {
      throw new NotFoundException('Paiement d’abonnement introuvable.');
    }

    // Mise à jour du statut
    payment.status = status;

    const updated = await this.subscriptionPaymentRepo.save(payment);

    return {
      message: 'Statut mis à jour avec succès',
      uuid: updated.uuid,
      status: updated.status,
    };
  }


  async findAll(
    page = 1,
    limit = 20,
    admin_uuid: string,
    search?: string,
  ) {
    // Vérification de l'admin
    await this.checkAdmin(admin_uuid);

    const take = Number(limit) > 0 ? Number(limit) : 20;
    const skip = (Number(page) - 1) * take;

    // Construction du where avec Or
    const where: any = search && search.trim() !== ''
      ? [
        { actor_name: ILike(`%${search.trim()}%`) },
        { beneficiary_name: ILike(`%${search.trim()}%`) },
      ]
      : {};

    const [items, total] = await this.subscriptionPaymentRepo.findAndCount({
      where,
      order: { created_at: 'DESC' },
      skip,
      take,
    });

    return {
      total,
      page: Number(page),
      limit: take,
      data: items,
      search: search || null,
    };
  }

  // ============================================================
  // HELPERS
  // ============================================================

  private async checkAdmin(uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid } });
    if (!admin) throw new NotFoundException('Admin introuvable');
    return admin;
  }

  private async findMember(uuid: string) {
    const member = await this.memberRepo.findOne({ where: { uuid } });
    if (!member) throw new NotFoundException('Membre introuvable');
    return member;
  }

  private async findSubscription(uuid: string) {
    const sub = await this.subscriptionCampaignRepo.findOne({ where: { uuid } });
    if (!sub) throw new NotFoundException("Campagne d'abonnement introuvable");
    return sub;
  }
}
