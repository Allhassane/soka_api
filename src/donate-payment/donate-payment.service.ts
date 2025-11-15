import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DonatePaymentEntity } from './entities/donate-payment.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from 'src/users/entities/user.entity';
import { LogActivitiesService } from 'src/log-activities/log-activities.service';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { MemberEntity } from 'src/members/entities/member.entity';
import { MakeDonationPaymentDto } from './dto/make-donation-payment';
import { PaymentSource } from 'src/payments/dto/create-payment.dto';
import { PaymentService } from 'src/payments/payment.service';
import axios from 'axios';
import { PaymentStatus } from 'src/payments/entities/payment.entity';

@Injectable()
export class DonatePaymentService {
  constructor(
    @InjectRepository(DonatePaymentEntity)
    private readonly donateRepo: Repository<DonatePaymentEntity>,

    private readonly logService: LogActivitiesService,

    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    @InjectRepository(MemberEntity)
    private readonly memberRepo: Repository<MemberEntity>,

    private readonly paymentService: PaymentService,
  ) {}

  // ============================================================
  //  1. INITIER UN DON + PAIEMENT
  // ============================================================
  async makeDonation(dto: MakeDonationPaymentDto, admin_uuid: string) {
    const admin = await this.checkAdmin(admin_uuid);

    const beneficiary = await this.findMember(dto.beneficiary_uuid);
    const actor = await this.findMember(dto.actor_uuid);
    const donate = await this.findCampaign(dto.donation_uuid);

    if (!dto.amount || dto.amount <= 0)
      throw new BadRequestException('Le montant du don doit être positif.');

    const description = `Paiement donation par ${actor.firstname} ${actor.lastname}`;

    // -------------------------------
    // Paiement via PaymentService
    // -------------------------------
    const paymentResult = await this.paymentService.store(
      {
        source: PaymentSource.DONATION,
        source_uuid: donate.uuid,

        beneficiary_uuid: beneficiary.uuid,
        beneficiary_name: `${beneficiary.firstname} ${beneficiary.lastname}`,

        actor_uuid: actor.uuid,
        actor_name: `${actor.firstname} ${actor.lastname}`,

        amount: dto.amount,
        quantity: 1,
      },
      admin_uuid,
    );

    // -------------------------------
    // Sauvegarde du DON
    // -------------------------------
    const donation = this.donateRepo.create({
      amount: dto.amount,
      beneficiary_uuid: beneficiary.uuid,
      beneficiary_name: `${beneficiary.firstname} ${beneficiary.lastname}`,
      actor_uuid: actor.uuid,
      actor_name: `${actor.firstname} ${actor.lastname}`,
      donate_uuid: donate.uuid,
      payment_uuid: paymentResult.uuid,
     // status: GlobalStatus.PENDING,
    });

    const saved = await this.donateRepo.save(donation);

    return {
      message: 'Don initié avec succès',
      donation_uuid: saved.uuid,
      payment_uuid: paymentResult.uuid,
      payment_url: paymentResult.payment_url,
      transaction_id: paymentResult.transactionId,
    };
  }

  async findAll(page = 1, limit = 20, admin_uuid: string) {
    await this.checkAdmin(admin_uuid);

    const [items, total] = await this.donateRepo.findAndCount({
      order: { created_at: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      total,
      page,
      limit,
      data: items,
    };
  }


  async findOne(uuid: string, admin_uuid: string) {
    await this.checkAdmin(admin_uuid);

    const donation = await this.donateRepo.findOne({ where: { uuid } });

    if (!donation) throw new NotFoundException('Don introuvable.');

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

      // ============================================================
      // 1. Vérification CinetPay
      // ============================================================
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
        throw new BadRequestException(
          `Paiement non validé par CinetPay : ${response.message}`,
        );
      }

      const paymentStatus = response.data.status;

      if (paymentStatus !== 'ACCEPTED') {
        throw new BadRequestException(
          `Paiement non accepté : statut = ${paymentStatus}`,
        );
      }

      // ============================================================
      // 2. Récupérer le paiement local
      // ============================================================
      const payment = await this.paymentService.findByTransactionIdOrFail(transaction_id,admin_uuid);

      if (!payment) {
        throw new NotFoundException(
          `Aucun paiement trouvé pour transaction_id = ${transaction_id}`,
        );
      }

      // ============================================================
      // 3. Mettre à jour le paiement
      // ============================================================

      await this.paymentService.updatePayment(payment.uuid, {
        status: GlobalStatus.SUCCESS,
        payment_status:PaymentStatus.PAID,
      });


      // ============================================================
      // 4. Mettre à jour le don associé
      // ============================================================
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

    return { message: 'Don supprimé avec succès' };
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
    if (!donation) throw new NotFoundException('Don introuvable');
    return donation;
  }

  private async findCampaign(uuid: string) {
    const campaign = await this.donateRepo.findOne({ where: { uuid } });
    if (!campaign) throw new NotFoundException('Campagne de dons introuvable');
    return campaign;
  }
}
