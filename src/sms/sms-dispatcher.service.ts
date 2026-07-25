import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from 'src/config/config.service';
import { SettingsService } from 'src/settings/settings.service';
import type {
  SendMessageInput,
  SendMessageResult,
} from 'src/journals/interfaces/sms-provider.interface';
import { SmsProviderRegistry } from './sms-provider.registry';
import {
  SETTING_SMS_ACTIVE_PROVIDER,
  SETTING_SMS_FAILOVER_ENABLED,
  settingProviderEnabledKey,
  SMS_DEFAULT_ACTIVE_PROVIDER,
  SMS_PROVIDER_NAMES,
} from './sms.constants';

/**
 * Aiguilleur SMS transactionnel : porte TOUTE la politique (fournisseur actif lu
 * en base, activation par fournisseur, repli/failover, simulation), les providers
 * n'étant que du transport.
 *
 * Garanties (chemin critique : 1re connexion / mot de passe oublié) :
 *  - Résout le fournisseur ACTIF à CHAQUE envoi (bascule à chaud, sans redéploiement).
 *  - Failover borné : essaie l'actif puis, si activé, l'autre fournisseur activé.
 *  - NE LÈVE JAMAIS : renvoie toujours un `SendMessageResult`.
 *  - Anti-verrouillage silencieux : si AUCUN fournisseur n'est réellement activable,
 *    la simulation est un SUCCÈS en dev mais un ÉCHEC (`success:false`) en prod →
 *    l'auth ne persistera jamais un mot de passe sans qu'un SMS soit réellement parti.
 */
@Injectable()
export class SmsDispatcher {
  private readonly logger = new Logger(SmsDispatcher.name);

  constructor(
    private readonly registry: SmsProviderRegistry,
    private readonly settings: SettingsService,
    private readonly appConfig: AppConfigService,
  ) {}

  /** Ordre des candidats : actif d'abord, puis les autres dans l'ordre canonique. */
  private orderedNames(active: string): string[] {
    const rest = SMS_PROVIDER_NAMES.filter((n) => n !== active);
    return [active, ...rest];
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const activeName = await this.settings.get(
      SETTING_SMS_ACTIVE_PROVIDER,
      SMS_DEFAULT_ACTIVE_PROVIDER,
    );
    const failoverEnabled = await this.settings.getBool(
      SETTING_SMS_FAILOVER_ENABLED,
      true,
    );

    // Liste ordonnée des candidats, filtrée par le toggle "enabled" en base.
    const order = failoverEnabled ? this.orderedNames(activeName) : [activeName];
    const candidates: string[] = [];
    for (const name of order) {
      const enabled = await this.settings.getBool(
        settingProviderEnabledKey(name),
        true,
      );
      if (enabled && this.registry.get(name)) candidates.push(name);
    }

    let attemptedReal = false;
    let lastError: SendMessageResult | null = null;

    for (const name of candidates) {
      const provider = this.registry.get(name)!;
      if (!provider.canSend()) {
        // Non activable (credentials absents ou envoi réel désactivé par env) :
        // ce n'est PAS un succès -> on passe au suivant (déclencheur de failover).
        continue;
      }
      attemptedReal = true;
      let result: SendMessageResult;
      try {
        result = await provider.send(input);
      } catch (err: any) {
        // Un provider ne devrait pas throw (il catch en interne), mais on blinde.
        result = {
          success: false,
          provider: name,
          error: err?.message ?? 'Erreur fournisseur inattendue',
        };
      }
      if (result.success) {
        if (name !== activeName) {
          this.logger.error(
            `[SMS][FAILOVER] actif='${activeName}' en échec -> envoi RÉUSSI via repli '${name}' (ref=${input.reference ?? '-'})`,
          );
        }
        return result;
      }
      lastError = result;
      this.logger.error(
        `[SMS][ATTEMPT-FAIL] provider='${name}' échec (ref=${input.reference ?? '-'}) :: ${result.error ?? 'inconnu'}`,
      );
    }

    // Aucun envoi réel réussi.
    if (!attemptedReal) {
      // Aucun fournisseur n'était réellement activable -> SIMULATION.
      const line = `[SMS][SIMULATION] aucun fournisseur activable (actif='${activeName}') to=${input.to} ref=${input.reference ?? '-'}`;
      if (this.appConfig.isProd) {
        // En prod, une simulation est un ÉCHEC : ne jamais laisser croire à un envoi.
        this.logger.error(
          `${line} :: refusé en PRODUCTION (aucun SMS envoyé)`,
        );
        return {
          success: false,
          provider: 'simulation',
          simulated: true,
          error:
            "Aucun fournisseur SMS n'est activé pour un envoi réel. Vérifiez la configuration (clé/activation) du fournisseur.",
        };
      }
      this.logger.warn(`${line} :: simulé (dev)`);
      return {
        success: true,
        provider: 'simulation',
        simulated: true,
        provider_message_id: 'sim',
      };
    }

    // Des envois réels ont été tentés mais ont tous échoué.
    this.logger.error(
      `[SMS][ALL-FAILED] tous les fournisseurs activés ont échoué (ref=${input.reference ?? '-'})`,
    );
    return (
      lastError ?? {
        success: false,
        provider: activeName,
        error: 'Échec d’envoi SMS',
      }
    );
  }

  /**
   * Envoi de CONTRÔLE via un fournisseur PRÉCIS (bypass actif/failover), pour la
   * page de paramètres. Ne simule jamais un succès : si le fournisseur n'est pas
   * réellement activable, renvoie un échec explicite.
   */
  async testSend(
    providerName: string,
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    const provider = this.registry.get(providerName);
    if (!provider) {
      return {
        success: false,
        provider: providerName,
        error: 'Fournisseur inconnu',
      };
    }
    if (!provider.canSend()) {
      return {
        success: false,
        provider: providerName,
        error:
          "Fournisseur non activable : credentials manquants ou envoi réel désactivé (*_ENABLED).",
      };
    }
    try {
      return await provider.send(input);
    } catch (err: any) {
      return {
        success: false,
        provider: providerName,
        error: err?.message ?? 'Erreur fournisseur inattendue',
      };
    }
  }
}
