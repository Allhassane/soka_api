import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AppConfigService } from 'src/config/config.service';
import { SettingsService } from 'src/settings/settings.service';
import { SmsProviderRegistry } from './sms-provider.registry';
import { SmsDispatcher } from './sms-dispatcher.service';
import type { SendMessageResult } from 'src/journals/interfaces/sms-provider.interface';
import type { ProviderBalance } from './interfaces/managed-sms-provider.interface';
import {
  SETTING_SMS_ACTIVE_PROVIDER,
  SETTING_SMS_FAILOVER_ENABLED,
  settingProviderEnabledKey,
  SMS_PROVIDER_LABELS,
  SMS_PROVIDER_NAMES,
  SmsProviderName,
} from './sms.constants';

export interface ProviderState {
  name: string;
  label: string;
  /** Toggle admin (base). */
  enabled: boolean;
  /** Peut réellement envoyer (credentials + envoi réel autorisé par env). */
  can_send: boolean;
  /** true si CE fournisseur est l'actif. */
  active: boolean;
  /** Solde best-effort (peut être indisponible). */
  balance: ProviderBalance | null;
}

export interface SmsSettingsState {
  active_provider: string;
  failover_enabled: boolean;
  providers: ProviderState[];
}

interface BalanceCacheEntry {
  value: ProviderBalance;
  ts: number;
}

/**
 * Logique de la page « Paramètres SMS » : état (dont solde, mis en cache court
 * pour ne pas taper l'API fournisseur à chaque lecture ni coupler la page à leur
 * uptime), bascule du fournisseur actif, activation/désactivation, test d'envoi.
 * N'expose JAMAIS de credential.
 */
@Injectable()
export class SmsSettingsService {
  private readonly balanceCache = new Map<string, BalanceCacheEntry>();
  private readonly balanceTtlMs = 90_000;
  // Anti-abus du test d'envoi (consomme de vrais crédits). Il n'existe pas de
  // ThrottlerModule global dans l'app -> cooldown mémoire simple.
  private lastTestAt = 0;
  private readonly testCooldownMs = 15_000;

  constructor(
    private readonly settings: SettingsService,
    private readonly registry: SmsProviderRegistry,
    private readonly dispatcher: SmsDispatcher,
    // Même source de défaut que le `SmsDispatcher` : sans ça, l'écran pourrait
    // désigner un fournisseur actif différent de celui qui envoie réellement.
    private readonly appConfig: AppConfigService,
  ) {}

  private assertKnownProvider(name: string): SmsProviderName {
    if (!SMS_PROVIDER_NAMES.includes(name as SmsProviderName)) {
      throw new NotFoundException(`Fournisseur SMS inconnu : ${name}`);
    }
    return name as SmsProviderName;
  }

  /** Solde best-effort avec cache court ; ne throw jamais. */
  private async balanceOf(name: string): Promise<ProviderBalance | null> {
    const provider = this.registry.get(name);
    if (!provider?.getBalance) return null;
    const cached = this.balanceCache.get(name);
    if (cached && Date.now() - cached.ts < this.balanceTtlMs) return cached.value;
    try {
      const value = await provider.getBalance();
      this.balanceCache.set(name, { value, ts: Date.now() });
      return value;
    } catch {
      return { provider: name, available: false, display: null };
    }
  }

  async getState(includeBalance = true): Promise<SmsSettingsState> {
    const active = await this.settings.get(
      SETTING_SMS_ACTIVE_PROVIDER,
      this.appConfig.smsDefaultProvider,
    );
    const failover = await this.settings.getBool(
      SETTING_SMS_FAILOVER_ENABLED,
      true,
    );
    const providers: ProviderState[] = [];
    for (const name of SMS_PROVIDER_NAMES) {
      const provider = this.registry.get(name);
      const enabled = await this.settings.getBool(
        settingProviderEnabledKey(name),
        true,
      );
      providers.push({
        name,
        label: SMS_PROVIDER_LABELS[name],
        enabled,
        can_send: provider ? provider.canSend() : false,
        active: name === active,
        balance: includeBalance ? await this.balanceOf(name) : null,
      });
    }
    return { active_provider: active, failover_enabled: failover, providers };
  }

  async setActiveProvider(name: string): Promise<SmsSettingsState> {
    const provider = this.assertKnownProvider(name);
    const enabled = await this.settings.getBool(
      settingProviderEnabledKey(provider),
      true,
    );
    if (!enabled) {
      throw new BadRequestException(
        `Impossible d'activer « ${SMS_PROVIDER_LABELS[provider]} » : ce fournisseur est désactivé. Activez-le d'abord.`,
      );
    }
    await this.settings.set(SETTING_SMS_ACTIVE_PROVIDER, provider, 'string');
    return this.getState(false);
  }

  async setProviderEnabled(
    name: string,
    enabled: boolean,
  ): Promise<SmsSettingsState> {
    const provider = this.assertKnownProvider(name);
    if (!enabled) {
      // Garde-fou : ne pas désactiver le DERNIER fournisseur encore activé,
      // ni le fournisseur ACTIF (sinon plus aucun envoi réel possible).
      const active = await this.settings.get(
        SETTING_SMS_ACTIVE_PROVIDER,
        this.appConfig.smsDefaultProvider,
      );
      if (provider === active) {
        throw new BadRequestException(
          "Impossible de désactiver le fournisseur ACTIF. Basculez d'abord sur l'autre fournisseur.",
        );
      }
      let stillEnabled = 0;
      for (const n of SMS_PROVIDER_NAMES) {
        const e =
          n === provider
            ? false
            : await this.settings.getBool(settingProviderEnabledKey(n), true);
        if (e) stillEnabled += 1;
      }
      if (stillEnabled === 0) {
        throw new BadRequestException(
          'Impossible de désactiver le dernier fournisseur activé.',
        );
      }
    }
    await this.settings.set(
      settingProviderEnabledKey(provider),
      enabled ? 'true' : 'false',
      'boolean',
    );
    return this.getState(false);
  }

  async setFailover(enabled: boolean): Promise<SmsSettingsState> {
    await this.settings.set(
      SETTING_SMS_FAILOVER_ENABLED,
      enabled ? 'true' : 'false',
      'boolean',
    );
    return this.getState(false);
  }

  /** Envoi de contrôle via un fournisseur précis (bypass actif/failover). */
  async test(name: string, to: string): Promise<SendMessageResult> {
    const provider = this.assertKnownProvider(name);
    const now = Date.now();
    if (now - this.lastTestAt < this.testCooldownMs) {
      throw new HttpException(
        'Test trop rapproché : patientez quelques secondes avant un nouvel envoi de contrôle.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.lastTestAt = now;
    return this.dispatcher.testSend(provider, {
      to,
      message:
        'SOKA : test de configuration SMS. Si vous recevez ce message, le fournisseur est opérationnel.',
      reference: `test-${provider}`,
    });
  }
}
