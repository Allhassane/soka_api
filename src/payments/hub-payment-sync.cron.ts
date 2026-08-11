import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentService } from './payment.service';

/**
 * Doit rester égal au défaut de `PaymentService.syncAllPendingHubPayments` : il ne sert qu'à
 * détecter la saturation de la file. Les deux divergeraient que l'alerte deviendrait muette
 * (plafond local plus haut) ou permanente (plus bas).
 */
const SYNC_BATCH_LIMIT = 500;

@Injectable()
export class HubPaymentSyncCronService {
  private readonly logger = new Logger(HubPaymentSyncCronService.name);
  private isRunning = false;

  constructor(private readonly paymentService: PaymentService) {}

  /** Toutes les 10 minutes : synchronise les paiements Hub encore en attente. */
  @Cron('0 */10 * * * *')
  async syncPendingHubPayments() {
    // 🚨 Interrupteur de POSTE DE TEST : une API locale branchée sur le guichet de PRODUCTION
    // ne doit rien pouvoir y écrire, or ce cron referme des liens abandonnés
    // (`cancelHubPaymentByTransactionId` désactive le lien au guichet). Défaut : armé —
    // seule la valeur littérale 'false' désarme, pour qu'aucune faute de frappe ne puisse
    // éteindre la synchronisation de production en silence.
    if (process.env.HUB_SYNC_CRON_ENABLED === 'false') {
      this.logger.warn('Cron de synchronisation Hub DÉSARMÉ (HUB_SYNC_CRON_ENABLED=false).');
      return;
    }

    if (this.isRunning) {
      this.logger.warn('Synchronisation Hub déjà en cours, exécution ignorée.');
      return;
    }

    this.isRunning = true;

    try {
      const result = await this.paymentService.syncAllPendingHubPayments();
      this.logger.log(
        `Sync Hub terminée : ${result.processed} traité(s), ${result.paid} payé(s), `
        + `${result.failed} échoué(s), ${result.abandoned} abandon(s) refermé(s), `
        + `${result.pending} en attente, ${result.errors} erreur(s).`,
      );

      /**
       * ⚠️ **Signal de surveillance à ne pas retirer.** Le défaut qui a coûté 585 000 XOF
       * était invisible dans le journal : le cron annonçait « 200 traités » avec entrain
       * pendant qu'il rejouait 200 liens morts et ne voyait aucun des paiements récents.
       * Une file qui touche le plafond veut dire que des paiements restent hors de portée -
       * c'est ce qu'il faut voir passer, pas le nombre de lignes traitées.
       */
      if (result.processed >= SYNC_BATCH_LIMIT) {
        this.logger.warn(
          `File de synchronisation SATURÉE (${result.processed} = plafond) : des paiements `
          + `plus anciens ne sont pas interrogés. Vérifier que les abandons se referment.`,
        );
      }
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
