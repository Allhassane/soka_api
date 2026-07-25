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
import { SMS_PROVIDER_SMSPRO } from '../sms.constants';

/**
 * Adaptateur SMSPro Africa — HTTP API (app.smspro.africa/api/http) — transport pur.
 *
 * Spec : auth par paramètre `api_token` dans le BODY (pas de Bearer) ; envoi via
 * POST /sms/send { api_token, recipient, sender_id, type:'plain', message } ;
 * enveloppe de réponse { status:'success'|'error', message, data }.
 *
 * `.env` : SMSPRO_API_TOKEN, SMSPRO_BASE_URL (défaut .../api/http),
 * SMSPRO_SENDER_ID (défaut SG-CI, DOIT être approuvé côté SMSPro), SMSPRO_ENABLED
 * ('true' = envoi réel autorisé), SMSPRO_TIMEOUT_MS.
 */
@Injectable()
export class SmspproSmsProvider implements ManagedSmsProvider {
  public readonly name = SMS_PROVIDER_SMSPRO;
  private readonly logger = new Logger(SmspproSmsProvider.name);
  private readonly http: AxiosInstance;
  private readonly token: string;
  private readonly senderId: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.token = (this.config.get<string>('SMSPRO_API_TOKEN') ?? '').trim();
    this.senderId = this.config.get<string>('SMSPRO_SENDER_ID') ?? 'SG-CI';
    this.enabled =
      (this.config.get<string>('SMSPRO_ENABLED') ?? 'false').toLowerCase() ===
      'true';
    this.http = axios.create({
      baseURL: (
        this.config.get<string>('SMSPRO_BASE_URL') ??
        'https://app.smspro.africa/api/http'
      ).replace(/\/+$/, ''),
      timeout: Number(this.config.get<string>('SMSPRO_TIMEOUT_MS') ?? 8000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });
  }

  canSend(): boolean {
    return this.enabled && this.token.length > 0;
  }

  /** Même format que LeTexto : 225 + 10 chiffres locaux EN CONSERVANT le 0. */
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
      // api_token DANS LE BODY (jamais en query string : le message = mot de passe
      // et le token ne doivent pas finir dans les access logs du proxy).
      const { data } = await this.http.post('/sms/send', {
        api_token: this.token,
        recipient: dest,
        sender_id: this.senderId,
        type: 'plain',
        message: input.message,
      });
      // HTTP 200 mais enveloppe { status:'error' } => échec applicatif.
      if (data?.status && data.status !== 'success') {
        return {
          success: false,
          provider: this.name,
          error: data?.message ?? 'Échec SMSPro',
          raw_response: data,
        };
      }
      return {
        success: true,
        provider: this.name,
        provider_message_id:
          data?.data?.id ?? data?.data?.uid ?? data?.id ?? undefined,
        raw_response: data,
      };
    } catch (err: any) {
      // Uniquement le message d'erreur (jamais le body ni err.config).
      const error =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err?.message ??
        'Erreur SMSPro';
      const status = err?.response?.status;
      this.logger.error(
        `[SMSPro][ERROR] to=${dest} http=${status ?? '-'} :: ${error}`,
      );
      return {
        success: false,
        provider: this.name,
        error,
        raw_response: err?.response?.data,
      };
    }
  }

  /** Solde SMSPro (data.remaining_balance, ex. « 80 FCFA ») — best-effort. */
  async getBalance(): Promise<ProviderBalance> {
    if (!this.token) {
      return { provider: this.name, available: false, display: null };
    }
    try {
      const { data } = await this.http.get('/balance', {
        params: { api_token: this.token },
      });
      const display = data?.data?.remaining_balance ?? null;
      return {
        provider: this.name,
        available: data?.status === 'success' && display != null,
        display,
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
