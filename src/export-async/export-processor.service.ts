// src/export-job/export-processor.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExportJobService } from './export-job.service';
import { ExportJobStatus } from './entities/export-job.entity';
import { PaymentEntity } from '../payments/entities/payment.entity'; // /payment/entities/payment.entity
import { DonatePaymentEntity } from 'src/donate-payment/entities/donate-payment.entity';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { MemberEntity } from '../members/entities/member.entity'; //'src/member/entities/member.entity';
import { User } from '../users/entities/user.entity';//'src/user/entities/user.entity';
import { StructureService } from 'src/structure/structure.service';
import { PaymentSource } from '../payments/dto/create-payment.dto'; //'src/payment/dto/create-payment.dto';
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ExportProcessorService {
  constructor(
    private exportJobService: ExportJobService,
    @InjectRepository(PaymentEntity)
    private paymentRepo: Repository<PaymentEntity>,
    @InjectRepository(DonatePaymentEntity)
    private donatePaymentRepo: Repository<DonatePaymentEntity>,
    @InjectRepository(SubscriptionPaymentEntity)
    private subscriptionPaymentRepo: Repository<SubscriptionPaymentEntity>,
    @InjectRepository(MemberEntity)
    private memberRepo: Repository<MemberEntity>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private structureService: StructureService,
  ) {}

  async processTransactionsExport(jobId: string,member_uuid: string,member_structure_uuid:string): Promise<void> {
    try {
      await this.exportJobService.updateJobStatus(jobId, ExportJobStatus.PROCESSING);

      const job = await this.exportJobService.getJob(jobId);
      const { source_uuid, admin_uuid, status } = job.params;

      await this.exportJobService.updateJobProgress(jobId, 10);

      const admin = await this.userRepo.findOne({ where: { uuid: admin_uuid } });
      const member = await this.memberRepo.findOne({ where: { uuid: member_uuid } });
      const sousGroups = await this.structureService.findByAllChildrens(member_structure_uuid);

      await this.exportJobService.updateJobProgress(jobId, 20);

      // Query principale
      const qb = this.paymentRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.actor', 'actor')
        .leftJoinAndSelect('actor.structure', 'actorStructure')
        .leftJoinAndSelect('p.beneficiary', 'beneficiary')
        .leftJoinAndSelect('beneficiary.structure', 'beneficiaryStructure')
        .where('p.source_uuid = :source_uuid', { source_uuid })
        .andWhere('actor.structure_uuid IN (:...groups)', { groups: sousGroups });

      if (status) {
        qb.andWhere('p.status = :status', { status });
      }

      qb.orderBy('p.created_at', 'DESC');
      const payments = await qb.getMany();

      await this.exportJobService.updateJobProgress(jobId, 40);

      // Récupérer les détails
      const result: any[] = [];

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
          transaction_id: p.transaction_id,
          source: p.source,
          payment_status: p.payment_status,
          status: p.status,
          created_at: p.created_at,
          amount_unit: p.amount,
          quantity: p.quantity,
          total_amount: p.total_amount,
          actor_firstname: p.actor?.firstname || '',
          actor_lastname: p.actor?.lastname || '',
          actor_phone: p.actor?.phone || '',
          actor_structure: p.actor?.structure?.name || '',
          beneficiary_firstname: p.beneficiary?.firstname || '',
          beneficiary_lastname: p.beneficiary?.lastname || '',
          beneficiary_phone: p.beneficiary?.phone || '',
          beneficiary_structure: p.beneficiary?.structure?.name || '',
        });
      }

      await this.exportJobService.updateJobProgress(jobId, 60);

      // Créer le workbook Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Transactions');

      worksheet.columns = [
        { header: 'ID Transaction', key: 'transaction_id', width: 20 },
        { header: 'Source', key: 'source', width: 15 },
        { header: 'Statut Paiement', key: 'payment_status', width: 15 },
        { header: 'Statut', key: 'status', width: 15 },
        { header: 'Date', key: 'created_at', width: 20 },
        { header: 'Montant Unitaire', key: 'amount_unit', width: 15 },
        { header: 'Quantité', key: 'quantity', width: 10 },
        { header: 'Montant Total', key: 'total_amount', width: 15 },
        { header: 'Acteur - Prénom', key: 'actor_firstname', width: 20 },
        { header: 'Acteur - Nom', key: 'actor_lastname', width: 20 },
        { header: 'Acteur - Téléphone', key: 'actor_phone', width: 15 },
        { header: 'Acteur - Structure', key: 'actor_structure', width: 25 },
        { header: 'Bénéficiaire - Prénom', key: 'beneficiary_firstname', width: 20 },
        { header: 'Bénéficiaire - Nom', key: 'beneficiary_lastname', width: 20 },
        { header: 'Bénéficiaire - Téléphone', key: 'beneficiary_phone', width: 15 },
        { header: 'Bénéficiaire - Structure', key: 'beneficiary_structure', width: 25 },
      ];

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      result.forEach(item => {
        worksheet.addRow({
          transaction_id: item.transaction_id || '',
          source: item.source || '',
          payment_status: item.payment_status || '',
          status: item.status || '',
          created_at: item.created_at ? new Date(item.created_at).toLocaleString('fr-FR') : '',
          amount_unit: item.amount_unit || 0,
          quantity: item.quantity || 0,
          total_amount: item.total_amount || 0,
          actor_firstname: item.actor_firstname,
          actor_lastname: item.actor_lastname,
          actor_phone: item.actor_phone,
          actor_structure: item.actor_structure,
          beneficiary_firstname: item.beneficiary_firstname,
          beneficiary_lastname: item.beneficiary_lastname,
          beneficiary_phone: item.beneficiary_phone,
          beneficiary_structure: item.beneficiary_structure,
        });
      });

      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin' },
            left: { style: 'thin' },
            bottom: { style: 'thin' },
            right: { style: 'thin' },
          };
        });
      });

      await this.exportJobService.updateJobProgress(jobId, 80);

      // Sauvegarder le fichier
      const fileName = `transactions_export_${Date.now()}.xlsx`;
      const uploadsDir = path.join(process.cwd(), 'uploads', 'exports');

      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, fileName);
      await workbook.xlsx.writeFile(filePath);

      await this.exportJobService.completeJob(jobId, filePath, fileName);

    } catch (error) {
      await this.exportJobService.updateJobStatus(
        jobId,
        ExportJobStatus.FAILED,
        error.message
      );
      throw error;
    }
  }

  async processMembersExport(jobId: string, workbook: ExcelJS.Workbook): Promise<void> {
    try {
      await this.exportJobService.updateJobStatus(jobId, ExportJobStatus.PROCESSING);

      await this.exportJobService.updateJobProgress(jobId, 70);

      // Sauvegarder le fichier
      const fileName = `membres_export_${Date.now()}.xlsx`;
      const uploadsDir = path.join(process.cwd(), 'uploads', 'exports');

      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const filePath = path.join(uploadsDir, fileName);
      await workbook.xlsx.writeFile(filePath);

      await this.exportJobService.updateJobProgress(jobId, 90);

      // Marquer le job comme terminé
      await this.exportJobService.completeJob(jobId, filePath, fileName);

      await this.exportJobService.updateJobProgress(jobId, 100);

    } catch (error) {
      console.error('Error in processMembersExport:', error);

      await this.exportJobService.updateJobStatus(
        jobId,
        ExportJobStatus.FAILED,
        error.message || 'Erreur inconnue lors de l\'export des membres'
      );

      throw error;
    }
  }
}
