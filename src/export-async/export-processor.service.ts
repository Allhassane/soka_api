// src/export-job/export-processor.service.ts
import { Injectable, Inject, forwardRef } from '@nestjs/common';
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
import { appliquerFiltresPaiementsCompta } from './accounting-payments-query';
import { construireFeuilleCompta } from './accounting-payments-sheet';

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
    // Dépendance circulaire StructureTreeService <-> ExportProcessorService → forwardRef.
    @Inject(forwardRef(() => StructureTreeService))
    private structureTreeService: StructureTreeService,

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

      // Périmètre de l'exportateur :
      //  - ADMIN → AUCUN périmètre : il voit TOUS les paiements de la source. (C'EST LE BUG du
      //    fichier vide : le compte admin porte une responsabilité sur une PETITE structure
      //    (ex. un district), donc `responsibilities[0].structure.uuid` n'est PAS vide → l'export
      //    se scopait à ce district → 0 ligne alors que les paiements viennent de toute l'orga.
      //    Le repli précédent ne couvrait que le cas « structure absente », pas « petite
      //    structure ».)
      //  - RESPONSABLE / MEMBRE → sa structure de responsabilité, à défaut sa structure propre
      //    (le JWT met souvent `structure: null` quand le niveau de la resp. ≠ niveau de la
      //    structure du membre - même cause que l'export des membres).
      const isAdmin = !!admin?.is_admin;
      const scopeStructureUuid = isAdmin
        ? null
        : (member_structure_uuid || member?.structure_uuid || null);
      const sousGroups = scopeStructureUuid
        ? await this.structureService.findByAllChildrens(scopeStructureUuid)
        : [];

      await this.exportJobService.updateJobProgress(jobId, 20);

      // Query principale
      const qb = this.paymentRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.actor', 'actor')
        .leftJoinAndSelect('actor.structure', 'actorStructure')
        .leftJoinAndSelect('p.beneficiary', 'beneficiary')
        .leftJoinAndSelect('beneficiary.structure', 'beneficiaryStructure')
        .where('p.source_uuid = :source_uuid', { source_uuid });

      // Restreindre au périmètre uniquement s'il existe (sinon : tout le source).
      if (scopeStructureUuid) {
        qb.andWhere('actor.structure_uuid IN (:...groups)', {
          groups: sousGroups.length > 0 ? sousGroups : ['__none__'],
        });
      }

      // Filtre de statut. L'option « Tous » du front envoie `status=all` (et non une valeur
      // vide) : sans ce garde, on faisait `p.status = 'all'` → 0 ligne. 'all' (ou absent) =>
      // aucun filtre => tous les statuts ; une valeur réelle (success/fail/pending…) filtre.
      if (status && status !== 'all') {
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

      // Construire les structure trees pour chaque bénéficiaire.
      // ⚠ getStructureTreeForResponsible recharge TOUTES les structures à chaque
      // appel → en boucle par bénéficiaire c'est O(N × structures), au point de
      // paraître « bloqué » sur de gros volumes. On met donc en CACHE par
      // (structure, niveau) : les nombreux bénéficiaires d'un même sous-groupe ne
      // déclenchent qu'un seul calcul.
      const beneficiaryStructureTreeMap = new Map<string, any>();
      const treeCache = new Map<string, any>();
      const resolveTree = async (
        structureUuid: string,
        order: number,
      ): Promise<any> => {
        const key = `${structureUuid}:${order}`;
        if (treeCache.has(key)) return treeCache.get(key);
        // getStructureTreeForResponsible vit sur StructureTreeService (retiré de
        // StructureService lors de l'audit P10) ; `order` est accepté mais ignoré
        // (l'arbre ne dépend que de la structure).
        const tree = await this.structureTreeService.getStructureTreeForResponsible(
          structureUuid,
          order,
        );
        treeCache.set(key, tree);
        return tree;
      };

      for (const p of payments) {
        if (!p.beneficiary?.uuid || !p.beneficiary?.structure_uuid) continue;

        const list = responsibilitiesMap.get(p.beneficiary.uuid) || [];
        const valid = list.filter((r) => r.level_order !== null);
        const order =
          valid.length > 0
            ? Math.min(...valid.map((r) => parseInt(r.level_order)))
            : 999;

        const tree = await resolveTree(p.beneficiary.structure_uuid, order);
        beneficiaryStructureTreeMap.set(p.beneficiary.uuid, tree);
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

  /**
   * **L'export des lignes d'une carte KPI de la Comptabilité.**
   *
   * Distinct de `processTransactionsExport`, et il doit le rester : ils ne filtrent pas la
   * même colonne de statut, n'appliquent pas le même périmètre et ne rendent pas les mêmes
   * colonnes. Ce qu'ils partagent - la résolution des arbres de structure et l'écriture du
   * classeur - est mis en commun (`resoudreArbresBeneficiaires`, `ecrireClasseur`), pas
   * recopié.
   *
   * ⚠️ Le job porte TOUT le filtre dans ses `params` : c'est ce qui rend l'export rejouable et
   * vérifiable après coup (« ce fichier, c'était quelle campagne, quel seau ? »).
   */
  async processAccountingPaymentsExport(jobId: string): Promise<void> {
    try {
      await this.exportJobService.updateJobStatus(jobId, ExportJobStatus.PROCESSING);

      const job = await this.exportJobService.getJob(jobId);
      const { type, campaign_uuid, bucket } = job.params ?? {};

      await this.exportJobService.updateJobProgress(jobId, 10);

      const qb = this.paymentRepo
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.actor', 'actor')
        .leftJoinAndSelect('p.beneficiary', 'beneficiary')
        .leftJoinAndSelect('beneficiary.structure', 'beneficiaryStructure');
      // 🚨 Le filtre de la tuile, et rien d'autre : cf. `accounting-payments-query.ts`.
      // Noter l'absence de jointure sur `actor.structure` - le fichier ne porte pas la
      // structure du payeur (exigence du 2026-08-26), inutile de la charger.
      appliquerFiltresPaiementsCompta(qb, { type, campaign_uuid, bucket });

      const paiements = await qb.getMany();
      await this.exportJobService.updateJobProgress(jobId, 40);

      const arbres = await this.resoudreArbresBeneficiaires(paiements);
      await this.exportJobService.updateJobProgress(jobId, 70);

      const { colonnes, lignes } = construireFeuilleCompta(paiements, arbres);

      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Paiements');
      worksheet.columns = colonnes;
      this.styliserEnTete(worksheet);
      lignes.forEach((l) => worksheet.addRow(l));

      await this.exportJobService.updateJobProgress(jobId, 85);

      const suffixe = [type, campaign_uuid ? 'campagne' : 'toutes', bucket]
        .filter(Boolean)
        .join('_');
      await this.ecrireClasseur(jobId, workbook, `comptabilite_${suffixe}`);
    } catch (error) {
      await this.exportJobService.updateJobStatus(
        jobId,
        ExportJobStatus.FAILED,
        error?.message || "Erreur inconnue lors de l'export comptable",
      );
      throw error;
    }
  }

  /**
   * Arbre de structure de chaque bénéficiaire, mis en CACHE par structure.
   *
   * ⚠️ `getStructureTreeForResponsible` recharge TOUTES les structures à chaque appel : en
   * boucle par bénéficiaire, c'est O(N x structures) et l'export paraît bloqué sur de gros
   * volumes. Les nombreux bénéficiaires d'un même sous-groupe ne déclenchent qu'un calcul.
   */
  private async resoudreArbresBeneficiaires(
    paiements: PaymentEntity[],
  ): Promise<Map<string, any>> {
    const parBeneficiaire = new Map<string, any>();
    const cache = new Map<string, any>();

    for (const p of paiements) {
      const uuid = p.beneficiary?.uuid;
      const structure = p.beneficiary?.structure_uuid;
      if (!uuid || !structure || parBeneficiaire.has(uuid)) continue;

      if (!cache.has(structure)) {
        // `order` est accepté mais ignoré : l'arbre ne dépend que de la structure.
        cache.set(
          structure,
          await this.structureTreeService.getStructureTreeForResponsible(structure, 999),
        );
      }
      parBeneficiaire.set(uuid, cache.get(structure));
    }

    return parBeneficiaire;
  }

  /** L'en-tête bleu et gras, commun aux exports du projet. */
  private styliserEnTete(worksheet: ExcelJS.Worksheet): void {
    const entete = worksheet.getRow(1);
    entete.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    entete.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
    entete.alignment = { vertical: 'middle', horizontal: 'center' };
  }

  /** Écrit le classeur dans `uploads/exports` et referme le job sur son chemin. */
  private async ecrireClasseur(
    jobId: string,
    workbook: ExcelJS.Workbook,
    base: string,
  ): Promise<void> {
    const fileName = `${base}_${Date.now()}.xlsx`;
    const dossier = path.join(process.cwd(), 'uploads', 'exports');
    if (!fs.existsSync(dossier)) fs.mkdirSync(dossier, { recursive: true });

    const chemin = path.join(dossier, fileName);
    await workbook.xlsx.writeFile(chemin);
    await this.exportJobService.completeJob(jobId, chemin, fileName);
  }
}
