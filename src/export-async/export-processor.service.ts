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
import { StructureTreeService } from 'src/structure/structure-tree.service';

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


   async processTransactionsExport(
    jobId: string,
    member_uuid: string,
    member_structure_uuid: string,
    file_name: string
  ): Promise<void> {
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
        .andWhere('actor.structure_uuid IN (:...groups)', { groups: sousGroups })
        ;

      if (status) {
        qb.andWhere('p.status = :status', { status });
      }

      qb.orderBy('p.created_at', 'DESC');
      const payments = await qb.getMany();
      //console.log('paiements trouvés:', payments);
      await this.exportJobService.updateJobProgress(jobId, 40);

      // Récupérer les responsabilités des bénéficiaires
      const beneficiaryUuids = payments
        .map(p => p.beneficiary?.uuid)
        .filter(Boolean);

      let beneficiaryResponsibilities: any[] = [];
      if (beneficiaryUuids.length > 0) {
        beneficiaryResponsibilities = await this.memberRepo
          .createQueryBuilder('m')
          .innerJoin('member_responsibilities', 'mr', 'mr.member_uuid = m.uuid AND mr.deleted_at IS NULL')
          .innerJoin('responsibilities', 'r', 'r.uuid = mr.responsibility_uuid AND r.deleted_at IS NULL')
          .leftJoin('levels', 'l', 'l.uuid = r.level_uuid')
          .select([
            'm.uuid AS member_uuid',
            'r.uuid AS responsibility_uuid',
            'r.name AS responsibility_name',
            'r.level_uuid AS level_uuid',
            'l.name AS level_name',
            'l.order AS level_order',
          ])
          .where('m.uuid IN (:...uuids)', { uuids: beneficiaryUuids })
          .andWhere('m.deleted_at IS NULL')
          .getRawMany();
      }

      // Grouper les responsabilités par bénéficiaire
      const responsibilitiesMap = new Map<string, any[]>();
      for (const br of beneficiaryResponsibilities) {
        if (!responsibilitiesMap.has(br.member_uuid)) {
          responsibilitiesMap.set(br.member_uuid, []);
        }
        responsibilitiesMap.get(br.member_uuid)!.push({
          uuid: br.responsibility_uuid,
          name: br.responsibility_name,
          level_uuid: br.level_uuid,
          level_name: br.level_name,
          level_order: br.level_order,
        });
      }

      // Construire les structure trees pour chaque bénéficiaire
      const beneficiaryStructureTreeMap = new Map<string, any>();

      for (const p of payments) {
        if (!p.beneficiary?.uuid || !p.beneficiary?.structure_uuid) continue;

        const beneficiaryResponsibilitiesList = responsibilitiesMap.get(p.beneficiary.uuid) || [];

        if (beneficiaryResponsibilitiesList.length > 0) {
          const validResponsibilities = beneficiaryResponsibilitiesList.filter(r => r.level_order !== null);

          if (validResponsibilities.length > 0) {
            const highestLevelOrder = Math.min(
              ...validResponsibilities.map(r => parseInt(r.level_order))
            );

            // Utilisation correcte du service injecté
            const tree = await this.structureService.getStructureTreeForResponsible(
              p.beneficiary.structure_uuid,
              highestLevelOrder
            );

            beneficiaryStructureTreeMap.set(p.beneficiary.uuid, tree);
          } else {
            // Utilisation correcte du service injecté
            const tree = await this.structureService.getStructureTreeForResponsible(
              p.beneficiary.structure_uuid,
              999
            );
            beneficiaryStructureTreeMap.set(p.beneficiary.uuid, tree);
          }
        } else {
          // Utilisation correcte du service injecté
          const tree = await this.structureService.getStructureTreeForResponsible(
            p.beneficiary.structure_uuid,
            999
          );
          beneficiaryStructureTreeMap.set(p.beneficiary.uuid, tree);
        }
      }

      await this.exportJobService.updateJobProgress(jobId, 50);

      // Fonction helper pour aplatir la structure tree
      const flattenStructureTree = (tree: any, skipFirst = true): { levelNames: string[], structureNames: string[] } => {
        const levelNames: string[] = [];
        const structureNames: string[] = [];

        if (tree) {
          if (!skipFirst) {
            levelNames.push(tree.level_name || '');
            structureNames.push(tree.name || '');
          }

          if (tree.children && tree.children.length > 0) {
            tree.children.forEach((child: any) => {
              const childResults = flattenStructureTree(child, false);
              levelNames.push(...childResults.levelNames);
              structureNames.push(...childResults.structureNames);
            });
          }
        }

        return { levelNames, structureNames };
      };

      // Récupérer un arbre exemple pour déterminer les noms de niveaux
      const sampleTree = beneficiaryStructureTreeMap.values().next().value;
      const { levelNames: structureLevelNames } = sampleTree ? flattenStructureTree(sampleTree, true) : { levelNames: [] };

      // Récupérer les détails des paiements
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

        // Récupérer et aplatir la structure tree du bénéficiaire
        const tree = p.beneficiary?.uuid ? beneficiaryStructureTreeMap.get(p.beneficiary.uuid) : null;
        const { structureNames: treeFlattened } = tree ? flattenStructureTree(tree, true) : { structureNames: [] };

        const rowData: any = {
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
        };

        // Ajouter les niveaux de structure du bénéficiaire
        structureLevelNames.forEach((levelName: string, index: number) => {
          rowData[`beneficiary_structure_level_${index}`] = treeFlattened[index] || '';
        });

        result.push(rowData);
      }

      await this.exportJobService.updateJobProgress(jobId, 60);

      // Créer le workbook Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Transactions');

      //console.log('structureLevelNames:', structureLevelNames);


      // Colonnes de base
      const baseColumns = [
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

      // Ajouter les colonnes pour la structure tree du bénéficiaire
      const structureTreeColumns: { header: string; key: string; width: number }[] = [];
      structureLevelNames.forEach((levelName: string, index: number) => {
        structureTreeColumns.push({
          header: `Bénéficiaire - ${levelName || `Structure Niveau ${index + 1}`}`,
          key: `beneficiary_structure_level_${index}`,
          width: 25,
        });
      });

      worksheet.columns = [...baseColumns, ...structureTreeColumns];

      // Styliser l'en-tête
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' },
      };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      // Ajouter les données
      result.forEach(item => {
        worksheet.addRow(item);
      });

      // Appliquer les bordures
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
      if (!file_name) {
        file_name = `transactions_export_${Date.now()}.xlsx`;
      } else {
        file_name = `${file_name}_${Date.now()}.xlsx`;
      }

      const fileName = file_name;
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

 /*  async processTransactionsExport(jobId: string,member_uuid: string,member_structure_uuid:string,file_name:string): Promise<void> {
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
        //console.log('payment ', p);

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
      if(!file_name) {
       file_name = `transactions_export_${Date.now()}.xlsx`;
      } else{
        console.log('file_name provided:', file_name);
        file_name = `${file_name}_${Date.now()}.xlsx`;
      }
      const fileName = file_name;
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
  } */

  async processMembersExport(jobId: string, workbook: ExcelJS.Workbook,file_name: string): Promise<void> {
    try {
      await this.exportJobService.updateJobStatus(jobId, ExportJobStatus.PROCESSING);

      await this.exportJobService.updateJobProgress(jobId, 70);

      // Sauvegarder le fichier
      if(!file_name) {
       file_name = `membre_export_${Date.now()}.xlsx`;
      } else{
        //console.log('file_name provided:', file_name);
        file_name = `${file_name}_${Date.now()}.xlsx`;
      }
      const fileName = file_name;
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



