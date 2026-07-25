import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import type {
  SendMessageInput,
  SendMessageResult,
} from 'src/journals/interfaces/sms-provider.interface';
import type {
  ManagedSmsProvider,
  ProviderBalance,
} from '../interfaces/managed-sms-provider.interface';
import { SMS_PROVIDER_LETEXTO } from '../sms.constants';

/**
 * Adaptateur LeTexto (apis.letexto.com/v1) — transport pur.
 *
 * Reprend la logique historique de `SmsService`, mais sous l'interface
 * `ManagedSmsProvider` pour être piloté par le `SmsDispatcher`. Ne s'auto-simule
 * PAS : `send()` fait l'appel réel ; c'est `canSend()` (lu par le dispatcher) qui
 * dit s'il faut l'appeler.
 *
 * `.env` : LETEXTO_API_KEY, LETEXTO_BASE_URL, LETEXTO_SENDER (défaut SG-CI),
 * LETEXTO_ENABLED ('true' = envoi réel autorisé), LETEXTO_TIMEOUT_MS.
 */
@Injectable()
export class LetextoSmsProvider implements ManagedSmsProvider {
  public readonly name = SMS_PROVIDER_LETEXTO;
  private readonly logger = new Logger(LetextoSmsProvider.name);
  private readonly http: AxiosInstance;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly sender: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.apiKey = (this.config.get<string>('LETEXTO_API_KEY') ?? '').trim();
    this.baseUrl =
      this.config.get<string>('LETEXTO_BASE_URL') ??
      'https://apis.letexto.com/v1';
    this.sender = this.config.get<string>('LETEXTO_SENDER') ?? 'SG-CI';
    this.enabled =
      (this.config.get<string>('LETEXTO_ENABLED') ?? 'false').toLowerCase() ===
      'true';
    this.http = axios.create({
      baseURL: this.baseUrl,
      // Timeout volontairement court : ces envois sont sur le chemin synchrone
      // du login ; avec le failover on peut enchaîner 2 providers.
      timeout: Number(this.config.get<string>('LETEXTO_TIMEOUT_MS') ?? 8000),
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
    });
  }

  canSend(): boolean {
    return this.enabled && this.apiKey.length > 0;
  }

  /**
   * Normalise un numéro CI : 225 + les 10 chiffres EN CONSERVANT le 0
   * (ex. 0749326623 -> 2250749326623). Retirer le 0 fait rejeter l'envoi
   * (incident déjà constaté en prod).
   */
  normalizePhone(raw: string): string {
    if (!raw) return '';
    let digits = raw.replace(/[^0-9]/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    let local = digits.startsWith('225') ? digits.slice(3) : digits;
    if (local.length === 9) local = `0${local}`;
    if (local.length === 10 && local.startsWith('0')) return `225${local}`;
    return digits.startsWith('225') ? digits : `225${local}`;
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const dest = this.normalizePhone(input.to);
    if (!dest) {
      return {
        success: false,
        provider: this.name,
        error: 'Numéro destinataire vide ou invalide',
      };
    }
    try {
      const { data } = await this.http.post('/messages/send', {
        from: this.sender,
        to: dest,
        content: input.message,
        ...(input.reference ? { customData: input.reference } : {}),
      });
      return {
        success: true,
        provider: this.name,
        provider_message_id: data?.id ?? data?.data?.id ?? undefined,
        raw_response: data,
      };
    } catch (err: any) {
      // NE JAMAIS logguer le body (contient le mot de passe) ni err.config
      // (contient l'Authorization). Uniquement le message d'erreur remonté.
      const error =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err?.message ??
        'Erreur LeTexto';
      this.logger.error(`[LeTexto][ERROR] to=${dest} :: ${error}`);
      return {
        success: false,
        provider: this.name,
        error,
        raw_response: err?.response?.data,
      };
    }
  }

  /** Solde LeTexto (XOF) — best-effort, ne throw jamais. */
  async getBalance(): Promise<ProviderBalance> {
    if (!this.apiKey) {
      return { provider: this.name, available: false, display: null };
    }
    try {
      const { data } = await this.http.get('/users/balance', {
        params: { token: this.apiKey },
      });
      const bal = data?.balance;
      return {
        provider: this.name,
        available: bal != null,
        display: bal != null ? `${bal} XOF` : null,
        raw: data,
      };
    } catch (err: any) {
      return {
        provider: this.name,
        available: false,
        display: null,
        raw: err?.response?.data ?? { error: 'balance indisponible' },
      };
    }
  }
}
