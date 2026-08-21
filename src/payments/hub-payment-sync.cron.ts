import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentService } from './payment.service';
import { hubSyncJournal } from './hub-sync-journal';

/**
 * Doit rester égal au défaut de `PaymentService.syncAllPendingHubPayments` : il ne sert qu'à
 * détecter la saturation de la file. Les deux divergeraient que l'alerte deviendrait muette
 * (plafond local plus haut) ou permanente (plus bas).
 */
const SYNC_BATCH_LIMIT = 500;

/**
 * **Toutes les 10 minutes, à la seconde 0** : :00, :10, :20, :30, :40, :50.
 *
 * Format à 6 champs de `@nestjs/schedule` (seconde minute heure jour mois jour-semaine) - le
 * premier `0` est la SECONDE, pas la minute. Écrit ici en constante parce que le journal de
 * bord l'annonce au démarrage : la valeur affichée et la valeur appliquée doivent être la même.
 */
const INTERVALLE = '0 */10 * * * *';

@Injectable()
export class HubPaymentSyncCronService implements OnModuleInit {
  private readonly logger = new Logger(HubPaymentSyncCronService.name);
  private isRunning = false;

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Trace le démarrage du processus dans le journal de bord.
   *
   * 🚨 Sans cette ligne, un redémarrage en boucle serait **invisible** : on ne verrait qu'un
   * fichier qui n'avance pas, symptôme identique à celui d'un serveur éteint. Elle dit aussi
   * tout de suite si le cron est désarmé, sans attendre le premier passage.
   */
  onModuleInit() {
    const arme = process.env.HUB_SYNC_CRON_ENABLED !== 'false';
    hubSyncJournal.demarrage(arme, INTERVALLE);

    if (hubSyncJournal.chemin) {
      this.logger.log(`Journal du cron Hub : ${hubSyncJournal.chemin}`);
    }
  }

  /** Toutes les 10 minutes : synchronise les paiements Hub encore en attente. */
  @Cron(INTERVALLE)
  async syncPendingHubPayments() {
    // 🚨 Interrupteur de POSTE DE TEST : une API locale branchée sur le guichet de PRODUCTION
    // ne doit rien pouvoir y écrire, or ce cron referme des liens abandonnés
    // (`cancelHubPaymentByTransactionId` désactive le lien au guichet). Défaut : armé -
    // seule la valeur littérale 'false' désarme, pour qu'aucune faute de frappe ne puisse
    // éteindre la synchronisation de production en silence.
    if (process.env.HUB_SYNC_CRON_ENABLED === 'false') {
      this.logger.warn('Cron de synchronisation Hub DÉSARMÉ (HUB_SYNC_CRON_ENABLED=false).');
      hubSyncJournal.passageDesarme();
      return;
    }

    if (this.isRunning) {
      this.logger.warn('Synchronisation Hub déjà en cours, exécution ignorée.');
      hubSyncJournal.passageIgnore();
      return;
    }

    this.isRunning = true;
    const debut = Date.now();

    try {
      const result = await this.paymentService.syncAllPendingHubPayments();
      const sature = result.processed >= SYNC_BATCH_LIMIT;

      this.logger.log(
        `Sync Hub terminée : ${result.processed} traité(s), ${result.paid} payé(s), `
        + `${result.failed} échoué(s), ${result.abandoned} abandon(s) refermé(s), `
        + `${result.pending} en attente, ${result.errors} erreur(s).`,
      );
      hubSyncJournal.passageOk(result, Date.now() - debut, sature);

      /**
       * ⚠️ **Signal de surveillance à ne pas retirer.** Le défaut qui a coûté 585 000 XOF
       * était invisible dans le journal : le cron annonçait « 200 traités » avec entrain
       * pendant qu'il rejouait 200 liens morts et ne voyait aucun des paiements récents.
       * Une file qui touche le plafond veut dire que des paiements restent hors de portée -
       * c'est ce qu'il faut voir passer, pas le nombre de lignes traitées.
       */
      if (sature) {
        this.logger.warn(
          `File de synchronisation SATURÉE (${result.processed} = plafond) : des paiements `
          + `plus anciens ne sont pas interrogés. Vérifier que les abandons se referment.`,
        );
      }

      /**
       * ⚠️ **Second signal de surveillance.** Un rattrapage veut dire qu'un membre a payé sur
       * un lien que l'application avait enterré : l'argent est récupéré, mais le fait qu'il
       * ait pu se perdre reste une anomalie. En régime normal ce compteur vaut 0 ; s'il se
       * met à monter, c'est que les tentatives se referment trop tôt.
       */
      if (result.recredited > 0) {
        this.logger.warn(
          `RATTRAPAGE : ${result.recredited} paiement(s) refermé(s) à tort puis encaissé(s) `
          + `au guichet viennent d'être crédités. À regarder - ce compteur doit rester à 0.`,
        );
      }
    } catch (error) {
      const err = error as Error;
      this.logger.error(
        `Erreur lors de la synchronisation Hub : ${err.message}`,
        err.stack,
      );
      hubSyncJournal.passageEnErreur(err.message, Date.now() - debut);
    } finally {
      this.isRunning = false;
    }
  }
}
