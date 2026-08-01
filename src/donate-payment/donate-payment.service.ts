import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DonatePaymentEntity } from './entities/donate-payment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { AccessScopeService } from 'src/access-scope/access-scope.service';
import { ILike, In, Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { MemberEntity } from 'src/members/entities/member.entity';
import { MakeDonationPaymentDto } from './dto/make-donation-payment';
import { PaymentSource } from 'src/payments/dto/create-payment.dto';
import { PaymentService } from 'src/payments/payment.service';
import axios from 'axios';
import { PaymentStatus } from 'src/payments/entities/payment.entity';
import { DonateEntity } from 'src/donate/entities/donate.entity';
import { DonateCategory } from 'src/shared/enums/donate.enum';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { HubService } from 'src/payments/hub.service';

@Injectable()
export class DonatePaymentService {
  constructor(
    @InjectRepository(DonatePaymentEntity)
    private readonly donateRepo: Repository<DonatePaymentEntity>,

    @InjectRepository(DonateEntity)
    private readonly donateCampaignRepo: Repository<DonateEntity>,


    @InjectRepository(SubscriptionPaymentEntity)
    private readonly subscriptionPaymentRepo: Repository<SubscriptionPaymentEntity>,

    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,

    private readonly paymentService: PaymentService,
    private readonly hubService: HubService,

    /** Périmètre hiérarchique du demandeur (service @Global). */
    private readonly accessScopeService: AccessScopeService,
  ) { }

  // ============================================================
  //   INITIER UN DON + PAIEMENT
  // ============================================================

  async makeDonation(dto: MakeDonationPaymentDto, admin_uuid: string) {


    const admin = await this.checkAdmin(admin_uuid);
    const beneficiary = await this.findMember(dto.beneficiary_uuid);
    const actor = await this.findMember(admin.member_uuid);
    const donate = await this.findCampaign(dto.donation_uuid);

    // -----------------------------------------
    // Vérification période de validité du don
    // -----------------------------------------
    const now = new Date();
    const start = new Date(donate.starts_at);
    const stop = new Date(donate.stops_at);

    if (now < start) {
      throw new BadRequestException(
        `Cette campagne de zaimu n'est pas encore ouverte. Elle démarre le ${start.toLocaleDateString()}.`
      );
    }

    if (now > stop) {
      throw new BadRequestException(
        `Cette campagne de zaimu est déjà clôturée depuis le ${stop.toLocaleDateString()}.`
      );
    }

    // Bloquer si un paiement est déjà en cours pour ce bénéficiaire
    const inProgressPayment = await this.donateRepo.count({
      where: {
        donate_uuid: donate.uuid,
        beneficiary_uuid: beneficiary.uuid,
        status: In([GlobalStatus.INIT, GlobalStatus.PENDING]),
      },
    });

    if (inProgressPayment > 0) {
      throw new BadRequestException(
        'Un paiement est déjà en cours pour ce bénéficiaire sur cette campagne.',
      );
    }

    let unitAmount: number;
    let quantity: number;

    // Toujours s’assurer que la quantité est un entier >= 1
    const rawQuantity = dto.quantity ?? 1;
    if (!Number.isInteger(rawQuantity) || rawQuantity < 1) {
      throw new BadRequestException(
        'La quantité doit être un entier supérieur ou égal à 1.',
      );
    }
    quantity = rawQuantity;

    /**
     * ── Quota : « nombre maximum de paiements par bénéficiaire » ──
     *
     * Le filtre par bénéficiaire était bon ici (contrairement aux abonnements), mais deux trous
     * rendaient le plafond inopérant :
     *  - on comptait des **lignes** (`count`) et non des **unités** : avec un plafond à 1, un
     *    bénéficiaire pouvait régler `quantity = 50` en une seule fois ;
     *  - la quantité demandée n'était jamais comparée au reste disponible, donc le dernier
     *    paiement pouvait dépasser le plafond d'autant que voulu.
     * Même règle et même formulation que les abonnements, pour que les deux modules se
     * comportent pareil. Seuls les paiements **réussis** comptent (les `pending` sont des
     * guichets abandonnés). Le calcul passe par `sumPaidQuantity`, partagé avec la route
     * `GET /donate-payments/quota` : deux copies de la règle finissent toujours par diverger.
     */
    const maxPerBeneficiary = donate.max_payments_per_beneficiary;
    const beneficiaryLabel = `${beneficiary.firstname} ${beneficiary.lastname}`;

    if (maxPerBeneficiary && maxPerBeneficiary > 0) {
      const alreadyPaid = await this.sumPaidQuantity(
        donate.uuid,
        beneficiary.uuid,
      );
      const remaining = maxPerBeneficiary - alreadyPaid;

      if (remaining <= 0) {
        throw new BadRequestException(
          `${beneficiaryLabel} a déjà réglé le maximum de ${maxPerBeneficiary} paiement(s) autorisé(s) pour cette campagne.`,
        );
      }

      if (quantity > remaining) {
        throw new BadRequestException(
          `Il ne reste que ${remaining} paiement(s) possible(s) pour ${beneficiaryLabel} sur cette campagne (maximum ${maxPerBeneficiary}, déjà réglé ${alreadyPaid}).`,
        );
      }
    } 

    if (donate.category === DonateCategory.FIXIED_AMOUNT) {
      // Montant imposé par la campagne
      if (!donate.amount || donate.amount <= 0) {
        throw new BadRequestException(
          "Le montant fixe configuré pour cette campagne est invalide.",
        );
      }

      unitAmount = donate.amount;
      // On ignore dto.amount même s’il est envoyé par le frontend
    } else {
      // FREE_AMOUNT
      if (!dto.amount || dto.amount <= 0) {
        throw new BadRequestException(
          'Le montant du zaimu est obligatoire et doit être positif pour une campagne à montant libre.',
        );
      }

      unitAmount = dto.amount;
    }

    const total = unitAmount * quantity;

    const description = `Paiement donation par ${actor.firstname} ${actor.lastname}`;


    // -------------------------------
    // Appel PaymentService (CinetPay inclus)
    // -------------------------------
    const paymentResult = await this.paymentService.store(
      {
        source: PaymentSource.DONATION,
        source_uuid: donate.uuid,

        beneficiary_uuid: beneficiary.uuid,
        beneficiary_name: `${beneficiary.firstname} ${beneficiary.lastname}`,

        actor_uuid: actor.uuid,
        actor_name: `${actor.firstname} ${actor.lastname}`,

        amount: unitAmount, // montant unitaire
        quantity,           // quantité validée
        paymentNumber: dto.paymentNumber,
      },
      admin_uuid,
    );

    console.log('Paiement via PaymentService :', paymentResult);

    // -------------------------------
    // 7. Sauvegarde du DON (paiement de don)
    // -------------------------------
    const donation = this.donateRepo.create({
      amount: total, // montant total effectivement payé
      quantity,
      beneficiary_uuid: beneficiary.uuid,
      beneficiary_name: `${beneficiary.firstname} ${beneficiary.lastname}`,
      actor_uuid: actor.uuid,
      actor_name: `${actor.firstname} ${actor.lastname}`,
      donate_uuid: donate.uuid,
      payment_uuid: paymentResult.payment_uuid,
      status: GlobalStatus.PENDING,
    });

    const saved = await this.donateRepo.save(donation);

    return {
      message: 'zaimu initié avec succès',
      donation_uuid: saved.uuid,
      payment_uuid: paymentResult.payment_uuid,
      transaction_id: paymentResult.transaction_id,
      amount: total,
      payment_url: paymentResult.payment_url,
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
     * `actor_uuid` / `actor_name` : sans filtre, tout détenteur de `dons_paiements_voir`
     * lisait qui donne quoi dans l'organisation entière.
     */
    const autorisees =
      await this.accessScopeService.structuresAutorisees(admin_uuid);

    if (autorisees !== null && autorisees.size === 0) {
      return { total: 0, page: Number(page), limit: take, data: [], search: search || null };
    }

    const qb = this.donateRepo
      .createQueryBuilder('dp')
      .orderBy('dp.created_at', 'DESC')
      .skip(skip)
      .take(take);

    if (search && search.trim() !== '') {
      qb.andWhere(
        '(dp.actor_name LIKE :recherche OR dp.beneficiary_name LIKE :recherche)',
        { recherche: `%${search.trim()}%` },
      );
    }

    if (autorisees !== null) {
      // Sous-requête : aucune relation ORM vers `members` (« pattern B », liaison par uuid).
      qb.andWhere(
        'dp.beneficiary_uuid IN (SELECT m.uuid FROM members m WHERE m.structure_uuid IN (:...structures))',
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


  async findOne(uuid: string, admin_uuid: string) {
    await this.checkAdmin(admin_uuid);

    const donation = await this.donateRepo.findOne({ where: { uuid } });

    if (!donation) throw new NotFoundException('zaimu introuvable.');

    return donation;
  }


  async update(uuid: string, input: any, admin_uuid: string) {
    await this.checkAdmin(admin_uuid);

    const donation = await this.findDonation(uuid);

    Object.assign(donation, input);

    return await this.donateRepo.save(donation);
  }


  async changeStatus(uuid: string, status: GlobalStatus, admin_uuid: string) {
    await this.checkAdmin(admin_uuid);

    const donation = await this.findDonation(uuid);

    donation.status = status;

    return await this.donateRepo.save(donation);
  }

  async confirmHubPayment(payload: { transaction_id: string }, admin_uuid: string) {
    try {
      const { transaction_id } = payload;

      if (!transaction_id) {
        throw new BadRequestException('transaction_id manquant');
      }

      await this.paymentService.findByTransactionIdOrFail(
        transaction_id,
        admin_uuid,
      );

      const result =
        await this.paymentService.syncHubPaymentByTransactionId(transaction_id);

      if (result.status === 'paid') {
        return {
          success: true,
          message: 'Paiement confirmé avec succès',
          transaction_id,
          donation_uuid: result.donation_uuid ?? null,
          hub_payment: result.hub_payment ?? null,
        };
      }

      if (result.status === 'failed') {
        throw new BadRequestException('Paiement échoué');
      }

      if (result.status === 'not_found') {
        throw new NotFoundException(
          `Aucun paiement trouvé pour transaction_id = ${transaction_id}`,
        );
      }

      throw new BadRequestException('Le paiement est en attente de validation.');
    } catch (error) {
      console.error('Erreur vérification Hub :', error.response?.data ?? error.message);

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throw error;
      }

      throw new BadRequestException(
        error.response?.data?.message ?? error.message,
      );
    }
  }

  async confirmPayment(payload: any, admin_uuid: string) {
    try {
      const { transaction_id } = payload;

      if (!transaction_id) {
        throw new BadRequestException('transaction_id manquant dans le callback CinetPay');
      }

      const verification = await axios.post(
        'https://api-checkout.cinetpay.com/v2/payment/check',
        {
          transaction_id,
          apikey: process.env.CINET_API_KEY,
          site_id: process.env.CINET_SITE_ID,
        },
      );

      const response = verification.data;

      if (response.code !== '00') {
        if(response.message === 'WAITING_CUSTOMER_PAYMENT' || response.message === 'WAITING_CUSTOMER_TO_VALIDATE') {
            throw new BadRequestException(
              `Le paiement est en attente de validation.`,
            );
        }

        else if(response.message === 'PAYMENT_FAILED') {
            const payment = await this.paymentService.findByTransactionIdOrFail(transaction_id, admin_uuid);
            if (!payment) {
              throw new NotFoundException(
                `Aucun paiement trouvé pour transaction_id = ${transaction_id}`,
              );
            }

            await this.paymentService.updatePayment(payment.uuid, {
              status: GlobalStatus.FAILED,
              payment_status: PaymentStatus.FAILED,
            });

          const donation = await this.donateRepo.findOne({
            where: { payment_uuid: payment.uuid },
          });

          if (donation) {
            donation.status = GlobalStatus.FAILED;
            await this.donateRepo.save(donation);
          }
           throw new BadRequestException(
            `Paiement échoué`,
          );
        }

        throw new BadRequestException(
          `Paiement non vérifié`,
        );
      }

      const paymentStatus = response.data.status;

      if (paymentStatus !== 'ACCEPTED') {
        throw new BadRequestException(
          `Paiement non accepté`,
        );
      }

      const payment = await this.paymentService.findByTransactionIdOrFail(transaction_id, admin_uuid);

      if (!payment) {
        throw new NotFoundException(
          `Aucun paiement trouvé pour transaction_id = ${transaction_id}`,
        );
      }

      await this.paymentService.updatePayment(payment.uuid, {
        status: GlobalStatus.SUCCESS,
        payment_status: PaymentStatus.PAID,
      });


      const donation = await this.donateRepo.findOne({
        where: { payment_uuid: payment.uuid },
      });

      if (donation) {
        donation.status = GlobalStatus.SUCCESS;
        await this.donateRepo.save(donation);
      }

      return {
        success: true,
        message: 'Paiement confirmé avec succès',
        transaction_id,
        donation_uuid: donation?.uuid ?? null,
      };

    } catch (error) {
      console.error('Erreur callback CinetPay :', error.response?.data ?? error.message);
      throw new BadRequestException(
        error.response?.data?.message ?? error.message,
      );
    }
  }


  async delete(uuid: string, admin_uuid: string) {
    await this.checkAdmin(admin_uuid);

    const donation = await this.findDonation(uuid);

    await this.donateRepo.remove(donation);

    return { message: 'zaimu supprimé avec succès' };
  }

  // ============================================================
  //  PRIVATE HELPERS
  // ============================================================

  /**
   * Unités déjà réglées par un bénéficiaire sur une campagne de zaimu (paiements réussis).
   * `SUM(quantity)` et non `COUNT(*)` - cf. le commentaire du quota dans `makeDonation`.
   * `COALESCE` : sans paiement, MySQL renvoie `NULL`, pas 0.
   */
  private async sumPaidQuantity(
    donateUuid: string,
    beneficiaryUuid: string,
  ): Promise<number> {
    const row = await this.donateRepo
      .createQueryBuilder('dp')
      .select('COALESCE(SUM(dp.quantity), 0)', 'total')
      .where('dp.donate_uuid = :donateUuid', { donateUuid })
      .andWhere('dp.beneficiary_uuid = :beneficiaryUuid', { beneficiaryUuid })
      .andWhere('dp.status = :status', { status: GlobalStatus.SUCCESS })
      .getRawOne<{ total: string | number | null }>();

    return Number(row?.total ?? 0);
  }

  /**
   * Quota restant d'un bénéficiaire sur une campagne de zaimu, pour que l'écran de paiement
   * dise la vérité avant le clic. `max = null` ⇒ illimité (`remaining = null`).
   *
   * Pas de contrôle de périmètre ici, contrairement aux abonnements : l'écran de zaimu ne
   * permet de payer que **pour soi-même** (le bénéficiaire est le membre connecté, cf.
   * `app/(dashboard)/dons/[donateId]/page.tsx`). On borne donc au demandeur lui-même.
   */
  async getMyQuota(donateUuid: string, admin_uuid: string) {
    const admin = await this.checkAdmin(admin_uuid);
    const campaign = await this.findCampaign(donateUuid);
    const beneficiary = await this.findMember(admin.member_uuid);

    const max = campaign.max_payments_per_beneficiary;
    const paid = await this.sumPaidQuantity(donateUuid, beneficiary.uuid);

    return {
      donate_uuid: donateUuid,
      beneficiary_uuid: beneficiary.uuid,
      max_payments_per_beneficiary: max && max > 0 ? max : null,
      paid,
      remaining: max && max > 0 ? Math.max(0, max - paid) : null,
    };
  }

  private async checkAdmin(uuid: string) {
    const admin = await this.userRepo.findOne({ where: { uuid } });
    if (!admin) throw new NotFoundException("Identifiant de l'auteur introuvable");
    return admin;
  }

  private async findMember(uuid: string) {
    const member = await this.memberRepo.findOne({ where: { uuid } });
    if (!member) throw new NotFoundException('Membre introuvable');
    return member;
  }

  private async findDonation(uuid: string) {
    const donation = await this.donateRepo.findOne({ where: { uuid } });
    if (!donation) throw new NotFoundException('zaimu introuvable');
    return donation;
  }

  private async findCampaign(uuid: string) {
    const campaign = await this.donateCampaignRepo.findOne({ where: { uuid } });
    if (!campaign) throw new NotFoundException('Campagne de zaimu introuvable');
    return campaign;
  }
}
