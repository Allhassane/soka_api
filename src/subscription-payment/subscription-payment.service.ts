import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { SubscriptionPaymentEntity } from './entities/subscription-payment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { AccessScopeService } from 'src/access-scope/access-scope.service';
import { ILike, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { MemberEntity } from 'src/members/entities/member.entity';
import { MakeSubscriptionPaymentDto } from './dto/make-subscription-payment';
import { PaymentSource } from 'src/payments/dto/create-payment.dto';
import { PaymentService } from 'src/payments/payment.service';
import axios from 'axios';
import { In } from 'typeorm';
import { PaymentStatus } from 'src/payments/entities/payment.entity';
import { SubscriptionEntity } from 'src/subscriptions/entities/subscription.entity';
import { StructureService } from 'src/structure/structure.service';

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


    /** Périmètre hiérarchique du demandeur (service @Global). */
    private readonly accessScopeService: AccessScopeService,
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

    // Bloquer si un paiement est déjà en cours pour ce bénéficiaire
    const inProgressPayment = await this.subscriptionPaymentRepo.count({
      where: {
        subscription_uuid: subscription.uuid,
        beneficiary_uuid: beneficiary.uuid,
        status: In([GlobalStatus.INIT, GlobalStatus.PENDING]),
      },
    });


    if (inProgressPayment > 0) {
      throw new BadRequestException(
        'Un paiement est déjà en cours pour ce bénéficiaire sur cette campagne.',
      );
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

    /**
     * ── Quota : « nombre maximum de paiements PAR BÉNÉFICIAIRE » ──
     *
     * ⚠️ Le compteur ne portait **aucun filtre sur `beneficiary_uuid`** : il comptait les
     * paiements réussis de TOUTE la campagne. Sur une campagne plafonnée à 50, les 50 premiers
     * paiements de l'organisation fermaient donc la campagne pour les ~7 950 membres, y compris
     * ceux qui n'avaient jamais payé - et le message « Limite de paiements atteinte » ne disait
     * pas pourquoi. Deux endroits du code disaient déjà l'inverse : le libellé de l'écran de
     * création (« Nombre maximum de paiements par bénéficiaire ») et la liste « à souscrire »
     * (`subscription.service.getOpenToSubscribe`), qui compte bien par bénéficiaire.
     *
     * On compte des **unités** (`SUM(quantity)`) et non des lignes : une ligne peut porter
     * `quantity = 10`, et c'est bien à la quantité que le plafond est comparé juste en dessous.
     * Compter les lignes rendrait le plafond contournable en un seul paiement.
     *
     * Seuls les paiements **réussis** comptent : la table est pleine de `pending` (guichet
     * abandonné avant paiement) qui n'ont jamais été encaissés - les compter bloquerait un
     * membre pour une tentative qu'il n'a jamais menée à bout.
     */
    const maxPerBeneficiary = subscription.max_payments_per_beneficiary;
    const beneficiaryName = `${beneficiary.firstname} ${beneficiary.lastname}`;

    if (maxPerBeneficiary && maxPerBeneficiary > 0) {
      const alreadyPaid = await this.sumPaidQuantity(
        subscription.uuid,
        beneficiary.uuid,
      );
      const remaining = maxPerBeneficiary - alreadyPaid;

      if (remaining <= 0) {
        throw new BadRequestException(
          `${beneficiaryName} a déjà réglé le maximum de ${maxPerBeneficiary} paiement(s) autorisé(s) pour cette campagne.`,
        );
      }

      if (quantity > remaining) {
        throw new BadRequestException(
          `Il ne reste que ${remaining} paiement(s) possible(s) pour ${beneficiaryName} sur cette campagne (maximum ${maxPerBeneficiary}, déjà réglé ${alreadyPaid}).`,
        );
      }
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
        paymentNumber: dto.paymentNumber,
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

    /**
     * ⚠️ Périmètre. Cette liste expose `beneficiary_uuid` / `beneficiary_name` et
     * `actor_uuid` / `actor_name` : sans filtre, tout détenteur de
     * `abonnements_paiements_voir` lisait qui paie quoi dans l'organisation entière.
     * La permission autorise l'écran, ce filtre borne les lignes.
     */
    const autorisees =
      await this.accessScopeService.structuresAutorisees(admin_uuid);

    if (autorisees !== null && autorisees.size === 0) {
      return { total: 0, page: Number(page), limit: take, data: [], search: search || null };
    }

    const qb = this.subscriptionPaymentRepo
      .createQueryBuilder('sp')
      .orderBy('sp.created_at', 'DESC')
      .skip(skip)
      .take(take);

    if (search && search.trim() !== '') {
      qb.andWhere(
        '(sp.actor_name LIKE :recherche OR sp.beneficiary_name LIKE :recherche)',
        { recherche: `%${search.trim()}%` },
      );
    }

    if (autorisees !== null) {
      // Le bénéficiaire doit résider dans le sous-arbre autorisé. Sous-requête plutôt que
      // jointure : `SubscriptionPaymentEntity` n'a aucune relation ORM vers `members`
      // (« pattern B » du projet, liaison par uuid).
      qb.andWhere(
        'sp.beneficiary_uuid IN (SELECT m.uuid FROM members m WHERE m.structure_uuid IN (:...structures))',
        { structures: [...autorisees] },
      );
    }

    const [items, total] = await qb.getManyAndCount();

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

  /**
   * Unités déjà réglées par un bénéficiaire sur une campagne (paiements réussis).
   * `SUM(quantity)` et non `COUNT(*)` - cf. le commentaire du quota dans `makeSubscription`.
   * `COALESCE` : sans paiement, MySQL renvoie `NULL`, pas 0.
   */
  private async sumPaidQuantity(
    subscriptionUuid: string,
    beneficiaryUuid: string,
  ): Promise<number> {
    const row = await this.subscriptionPaymentRepo
      .createQueryBuilder('sp')
      .select('COALESCE(SUM(sp.quantity), 0)', 'total')
      .where('sp.subscription_uuid = :subscriptionUuid', { subscriptionUuid })
      .andWhere('sp.beneficiary_uuid = :beneficiaryUuid', { beneficiaryUuid })
      .andWhere('sp.status = :status', { status: GlobalStatus.SUCCESS })
      .getRawOne<{ total: string | number | null }>();

    return Number(row?.total ?? 0);
  }

  /**
   * Quota restant d'un bénéficiaire sur une campagne, pour que l'écran de paiement dise la
   * vérité **avant** le clic plutôt que de renvoyer un refus après.
   * `max = null` ⇒ illimité (`remaining = null`), même convention que l'enforcement.
   *
   * Borné au périmètre du demandeur, comme la liste des paiements : sans ce contrôle, l'uuid
   * d'un membre suffirait à savoir combien il a versé, hors de toute responsabilité.
   */
  async getBeneficiaryQuota(
    subscriptionUuid: string,
    beneficiaryUuid: string,
    admin_uuid: string,
  ) {
    await this.checkAdmin(admin_uuid);
    const subscription = await this.findSubscription(subscriptionUuid);
    const beneficiary = await this.findMember(beneficiaryUuid);

    const autorisees =
      await this.accessScopeService.structuresAutorisees(admin_uuid);
    if (
      autorisees !== null &&
      (!beneficiary.structure_uuid || !autorisees.has(beneficiary.structure_uuid))
    ) {
      throw new ForbiddenException(
        "Ce membre n'est pas dans votre périmètre.",
      );
    }

    const max = subscription.max_payments_per_beneficiary;
    const paid = await this.sumPaidQuantity(subscriptionUuid, beneficiaryUuid);

    return {
      subscription_uuid: subscriptionUuid,
      beneficiary_uuid: beneficiaryUuid,
      max_payments_per_beneficiary: max && max > 0 ? max : null,
      paid,
      remaining: max && max > 0 ? Math.max(0, max - paid) : null,
    };
  }

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
