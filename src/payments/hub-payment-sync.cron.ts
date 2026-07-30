import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentService } from './payment.service';

@Injectable()
export class HubPaymentSyncCronService {
  private readonly logger = new Logger(HubPaymentSyncCronService.name);
  private isRunning = false;

  constructor(private readonly paymentService: PaymentService) {}

  /** Toutes les 10 minutes : synchronise les paiements Hub encore en attente. */
  @Cron('0 */10 * * * *')
  async syncPendingHubPayments() {
    if (this.isRunning) {
      this.logger.warn('Synchronisation Hub déjà en cours, exécution ignorée.');
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.paymentService.syncAllPendingHubPayments();
      this.logger.log(
        `Sync Hub terminée : ${result.processed} traité(s), ${result.paid} payé(s), ${result.failed} échoué(s), ${result.pending} en attente, ${result.errors} erreur(s).`,
      );
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Erreur lors de la synchronisation Hub : ${err.message}`,
        err.stack,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
