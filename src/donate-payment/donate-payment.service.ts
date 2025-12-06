import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DonatePaymentEntity } from './entities/donate-payment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
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

@Injectable()
export class DonatePaymentService {
  constructor(
    @InjectRepository(DonatePaymentEntity)
    private readonly donateRepo: Repository<DonatePaymentEntity>,

    @InjectRepository(DonateEntity)
    private readonly donateCampaignRepo: Repository<DonateEntity>,


    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,

    private readonly paymentService: PaymentService,
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

    // -------------------------------
    //  Vérifier le quota de paiements
    // -------------------------------
    // On suppose un champ : donate.max_payments_per_beneficiary (number | null)
    if (
      donate.max_payments_per_beneficiary &&
      donate.max_payments_per_beneficiary > 0
    ) {
      const existingCount = await this.donateRepo.count({
        where: {
          donate_uuid: donate.uuid,
          beneficiary_uuid: beneficiary.uuid,
        },
      });

      if (existingCount >= donate.max_payments_per_beneficiary) {
        throw new BadRequestException(
          `Ce bénéficiaire a déjà atteint le nombre maximum de paiements autorisés pour cette campagne.`,
        );
      }
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

    // Construction du where
    const where: any = {};

    if (search && search.trim() !== '') {
      where.OR = [
        { nom: ILike(`%${search.trim()}%`) },
        { prenom: ILike(`%${search.trim()}%`) },
      ];
    }

    const [items, total] = await this.donateRepo.findAndCount({
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
