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
  SETTING_SMS_BROADCAST_ENABLED,
  SETTING_SMS_FAILOVER_ENABLED,
  settingProviderEnabledKey,
  SMS_PROVIDER_NAMES,
} from './sms.constants';

/**
 * Résultat d'un envoi vu par l'appelant. Identique à `SendMessageResult`, plus le
 * détail par fournisseur : en mode DIFFUSION un envoi peut être PARTIEL (un
 * fournisseur passe, l'autre non) et `success` seul ne le dirait pas.
 */
export interface SmsDispatchResult extends SendMessageResult {
  /** Fournisseurs ayant réellement accepté l'envoi (vide si échec total). */
  providers?: string[];
  /** Une entrée par fournisseur réellement appelé, dans l'ordre d'envoi. */
  attempts?: SendMessageResult[];
}

/**
 * Aiguilleur SMS transactionnel : porte TOUTE la politique (fournisseur actif lu
 * en base, activation par fournisseur, diffusion, repli/failover, simulation),
 * les providers n'étant que du transport.
 *
 * Deux modes, résolus en base à CHAQUE envoi (bascule à chaud, sans redéploiement) :
 *  - **DIFFUSION** (`sms.broadcast.enabled`, actif par défaut) : envoi EN PARALLÈLE
 *    par TOUS les fournisseurs activés → le membre reçoit un SMS par fournisseur.
 *    Succès dès qu'UN fournisseur accepte. Le failover n'a plus d'objet ici.
 *  - **AIGUILLAGE** : un seul fournisseur (l'actif), avec repli borné sur l'autre
 *    si `sms.failover.enabled`.
 *
 * Garanties (chemin critique : 1re connexion / mot de passe oublié) :
 *  - NE LÈVE JAMAIS : renvoie toujours un `SmsDispatchResult`.
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

  /** Appel d'un provider qui ne remonte jamais d'exception. */
  private async attempt(
    name: string,
    input: SendMessageInput,
  ): Promise<SendMessageResult> {
    try {
      // Un provider ne devrait pas throw (il catch en interne), mais on blinde.
      return await this.registry.get(name)!.send(input);
    } catch (err: any) {
      return {
        success: false,
        provider: name,
        error: err?.message ?? 'Erreur fournisseur inattendue',
      };
    }
  }

  /**
   * Résultat quand aucun fournisseur n'était réellement activable : SUCCÈS simulé
   * en dev, ÉCHEC explicite en prod (jamais de mot de passe persisté sans SMS).
   */
  private simulate(input: SendMessageInput, activeName: string): SmsDispatchResult {
    const line = `[SMS][SIMULATION] aucun fournisseur activable (actif='${activeName}') to=${input.to} ref=${input.reference ?? '-'}`;
    if (this.appConfig.isProd) {
      this.logger.error(`${line} :: refusé en PRODUCTION (aucun SMS envoyé)`);
      return {
        success: false,
        provider: 'simulation',
        simulated: true,
        providers: [],
        error:
          "Aucun fournisseur SMS n'est activé pour un envoi réel. Vérifiez la configuration (clé/activation) du fournisseur.",
      };
    }
    this.logger.warn(`${line} :: simulé (dev)`);
    return {
      success: true,
      provider: 'simulation',
      simulated: true,
      providers: [],
      provider_message_id: 'sim',
    };
  }

  async send(input: SendMessageInput): Promise<SmsDispatchResult> {
    // Défauts de déploiement (`.env`), utilisés seulement si la base ne dit rien.
    const activeName = await this.settings.get(
      SETTING_SMS_ACTIVE_PROVIDER,
      this.appConfig.smsDefaultProvider,
    );
    const broadcastEnabled = await this.settings.getBool(
      SETTING_SMS_BROADCAST_ENABLED,
      this.appConfig.smsBroadcastEnabled,
    );
    if (broadcastEnabled) return this.broadcast(input, activeName);

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
      const result = await this.attempt(name, input);
      if (result.success) {
        if (name !== activeName) {
          this.logger.error(
            `[SMS][FAILOVER] actif='${activeName}' en échec -> envoi RÉUSSI via repli '${name}' (ref=${input.reference ?? '-'})`,
          );
        }
        return { ...result, providers: [name], attempts: [result] };
      }
      lastError = result;
      this.logger.error(
        `[SMS][ATTEMPT-FAIL] provider='${name}' échec (ref=${input.reference ?? '-'}) :: ${result.error ?? 'inconnu'}`,
      );
    }

    // Aucun envoi réel réussi.
    // Aucun fournisseur n'était réellement activable -> SIMULATION.
    if (!attemptedReal) return this.simulate(input, activeName);

    // Des envois réels ont été tentés mais ont tous échoué.
    this.logger.error(
      `[SMS][ALL-FAILED] tous les fournisseurs activés ont échoué (ref=${input.reference ?? '-'})`,
    );
    return {
      ...(lastError ?? {
        success: false,
        provider: activeName,
        error: 'Échec d’envoi SMS',
      }),
      providers: [],
    };
  }

  /**
   * Mode DIFFUSION : envoie le message via TOUS les fournisseurs activés et
   * réellement activables, **en parallèle**. Le destinataire reçoit donc autant de
   * SMS que de fournisseurs (2 aujourd'hui).
   *
   * Le parallélisme n'est pas cosmétique : cet envoi est sur le chemin SYNCHRONE
   * du login, et deux appels en série cumuleraient les timeouts (2 × 8 s).
   *
   * Succès dès qu'UN fournisseur accepte : sur le chemin d'auth, exiger que les
   * deux passent transformerait la panne d'un fournisseur en blocage de connexion,
   * alors que le membre a bel et bien reçu son mot de passe. Un envoi partiel est
   * donc un succès, tracé en WARN avec le détail par fournisseur.
   */
  private async broadcast(
    input: SendMessageInput,
    activeName: string,
  ): Promise<SmsDispatchResult> {
    const candidates: string[] = [];
    for (const name of this.orderedNames(activeName)) {
      const enabled = await this.settings.getBool(
        settingProviderEnabledKey(name),
        true,
      );
      const provider = this.registry.get(name);
      // `canSend()` filtré ICI (et pas dans la boucle d'envoi) : un fournisseur
      // non activable ne doit pas compter comme une tentative réelle, sinon
      // l'anti-verrouillage de `simulate()` ne se déclencherait jamais.
      if (enabled && provider?.canSend()) candidates.push(name);
    }

    if (candidates.length === 0) return this.simulate(input, activeName);

    const attempts = await Promise.all(
      candidates.map((name) => this.attempt(name, input)),
    );
    const ok = attempts.filter((r) => r.success);
    const ko = attempts.filter((r) => !r.success);
    const okNames = ok.map((r) => r.provider);

    if (ok.length === 0) {
      this.logger.error(
        `[SMS][BROADCAST][ALL-FAILED] ${candidates.join('+')} en échec (ref=${input.reference ?? '-'}) :: ${ko
          .map((r) => `${r.provider}: ${r.error ?? 'inconnu'}`)
          .join(' | ')}`,
      );
      return {
        ...attempts[0],
        provider: candidates.join('+'),
        providers: [],
        error: ko.map((r) => `${r.provider}: ${r.error ?? 'inconnu'}`).join(' | '),
        attempts,
      };
    }

    if (ko.length > 0) {
      this.logger.warn(
        `[SMS][BROADCAST][PARTIEL] envoyé via ${okNames.join('+')} ; échec ${ko
          .map((r) => `${r.provider}: ${r.error ?? 'inconnu'}`)
          .join(' | ')} (ref=${input.reference ?? '-'})`,
      );
    } else {
      this.logger.log(
        `[SMS][BROADCAST] envoyé via ${okNames.join('+')} (${ok.length} SMS, ref=${input.reference ?? '-'})`,
      );
    }

    // `error` reste vide sur un succès partiel (invariant : error <=> !success) ;
    // le détail des échecs est dans `attempts` et dans le WARN ci-dessus.
    return {
      success: true,
      provider: okNames.join('+'),
      providers: okNames,
      provider_message_id: ok[0].provider_message_id,
      attempts,
    };
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
