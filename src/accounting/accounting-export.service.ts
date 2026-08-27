import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as fs from 'fs';
import {
  ExportJobEntity,
  ExportJobStatus,
  TYPE_EXPORT_COMPTA,
} from 'src/export-async/entities/export-job.entity';
import { ExportJobService } from 'src/export-async/export-job.service';
import { ExportProcessorService } from 'src/export-async/export-processor.service';
import { BucketStats, SourceStats, verifierBucket, verifierSource } from './accounting.helpers';

export interface FiltresExportCompta {
  type: string;
  campaign_uuid?: string;
  bucket?: string;
}

/**
 * **L'export Excel des lignes d'une carte KPI de la Comptabilité.**
 *
 * 🚨 **Ces exports n'appartiennent PAS au module Exports** (décision produit du 2026-08-26) :
 * ils se lancent, se suivent et se téléchargent depuis la Comptabilité, et de là seulement.
 * Le cloisonnement est posé aux **deux** bouts, et il le faut : cacher les jobs de la liste du
 * module Exports ne fait que dissimuler un identifiant, ça ne ferme aucune route.
 * - `ExportJobService.getUserJobs` les exclut de la liste ;
 * - `PaymentService.downloadTransactionsExport` refuse un job comptable ;
 * - ce service refuse tout job qui **n'est pas** comptable - sans quoi la permission
 *   Comptabilité suffirait à télécharger l'export de membres de quelqu'un d'autre.
 *
 * ⚠️ **Ce service écrit dans `export_jobs`, jamais dans `payments`.** La règle du module
 * (« il n'écrit que dans ses propres tables `acc_*` ») visait les données métier : le suivi
 * d'un job est délégué au module qui possède cette table, pas réimplémenté ici. Le module
 * Comptabilité reste en lecture stricte sur l'argent.
 */
@Injectable()
export class AccountingExportService {
  private readonly logger = new Logger(AccountingExportService.name);

  constructor(
    private readonly exportJobService: ExportJobService,
    private readonly exportProcessorService: ExportProcessorService,
  ) {}

  /**
   * Met en file l'export d'un seau. Rend l'identifiant du job : le fichier n'existe pas encore.
   *
   * ⚠️ Le seau et la campagne sont **validés avant** la création du job. Un job créé sur des
   * paramètres invalides échouerait plus tard, en arrière-plan, avec pour seule trace une ligne
   * `FAILED` que personne ne regarde - alors que le refus immédiat s'affiche à l'écran.
   */
  async lancer(f: FiltresExportCompta, user_uuid: string) {
    const type: SourceStats = verifierSource(f.type);
    const bucket: BucketStats = verifierBucket(f.bucket);
    const campaign_uuid = f.campaign_uuid?.trim() || undefined;

    const job = await this.exportJobService.createJob(
      TYPE_EXPORT_COMPTA,
      { type, campaign_uuid, bucket },
      user_uuid,
    );

    // Même mécanique que l'export de transactions : on rend la main tout de suite, le fichier
    // se construit en arrière-plan. Une erreur du traitement marque le job `FAILED` (le
    // processeur s'en charge) - elle ne doit pas remonter dans une promesse non attendue.
    setImmediate(() => {
      this.exportProcessorService
        .processAccountingPaymentsExport(job.uuid)
        .catch((e) => this.logger.error(`Export comptable ${job.uuid} : ${e?.message ?? e}`));
    });

    return {
      success: true,
      message: 'Export en cours de préparation',
      jobId: job.uuid,
    };
  }

  /** Avancement d'un export comptable - ce que le bouton interroge en attendant le fichier. */
  async statut(jobId: string, user_uuid: string) {
    const job = await this.lireJobCompta(jobId, user_uuid);
    return {
      jobId: job.uuid,
      status: job.status,
      progress: job.progress,
      file_name: job.file_name,
      error_message: job.error_message,
    };
  }

  /** Le fichier lui-même, une fois le job terminé. */
  async telecharger(jobId: string, user_uuid: string) {
    const job = await this.lireJobCompta(jobId, user_uuid);

    if (job.status !== ExportJobStatus.COMPLETED) {
      throw new BadRequestException({
        message: `Export pas encore terminé (statut : ${job.status}).`,
        data: { code: 'EXPORT_EN_COURS', status: job.status },
      });
    }
    if (!job.file_path || !fs.existsSync(job.file_path)) {
      throw new NotFoundException({
        message: "Le fichier d'export est introuvable.",
        data: { code: 'FICHIER_INTROUVABLE' },
      });
    }

    return {
      buffer: fs.readFileSync(job.file_path),
      filename: job.file_name,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  /**
   * 🚨 Le point de passage obligé : **le bon type ET le bon propriétaire**. Les deux contrôles
   * sont ici, ensemble, pour qu'aucune route de ce service ne puisse en oublier un.
   */
  private async lireJobCompta(jobId: string, user_uuid: string): Promise<ExportJobEntity> {
    const job = await this.exportJobService.getJob(jobId);

    if (job.type !== TYPE_EXPORT_COMPTA) {
      throw new ForbiddenException(
        "Cet export n'appartient pas au module Comptabilité",
      );
    }
    if (job.user_uuid !== user_uuid) {
      throw new ForbiddenException("Vous n'avez pas accès à ce fichier");
    }
    return job;
  }
}
