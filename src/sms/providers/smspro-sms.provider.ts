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
import { SMS_SENDER_ID } from 'src/shared/constants/constants';

/**
 * Adaptateur SMSPro Africa - API v3 (app.smspro.africa/api/v3) - transport pur.
 *
 * Spec (doc officielle : https://app.smspro.africa/developers/docs) :
 *   - auth par en-tête `Authorization: Bearer <api_token>` ;
 *   - envoi via POST /sms/send { recipient, sender_id, type:'plain', message } ;
 *   - enveloppe de réponse { status:'success'|'error', message, data } - un HTTP 200
 *     peut porter status:'error', donc l'enveloppe est TOUJOURS relue.
 *
 * ⚠️ Le compte accepte aussi l'ancien schéma (`/api/http` + `api_token` dans le
 * corps ou en query), vérifié en direct sur `/balance` : les deux renvoient 200.
 * On retient le Bearer parce que c'est le schéma **validé de bout en bout, envoi
 * compris** (mini-projet `sendsms/`), et parce qu'un token en query string finit
 * dans les journaux d'accès du proxy - ce que faisait encore `getBalance()`.
 *
 * `.env` : SMSPRO_API_TOKEN, SMSPRO_BASE_URL (défaut .../api/v3),
 * SMSPRO_SENDER_ID (défaut « SOKA CI » depuis le 2026-08-19 - avant : `SGBNDCI` ;
 * 11 caractères max, DOIT être approuvé côté SMSPro), SMSPRO_ENABLED ('true' =
 * envoi réel autorisé), SMSPRO_TIMEOUT_MS.
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
    // Défaut aligné sur le sender unique validé chez les deux fournisseurs.
    this.senderId = this.config.get<string>('SMSPRO_SENDER_ID') ?? SMS_SENDER_ID;
    this.enabled =
      (this.config.get<string>('SMSPRO_ENABLED') ?? 'false').toLowerCase() ===
      'true';
    this.http = axios.create({
      baseURL: (
        this.config.get<string>('SMSPRO_BASE_URL') ??
        'https://app.smspro.africa/api/v3'
      ).replace(/\/+$/, ''),
      timeout: Number(this.config.get<string>('SMSPRO_TIMEOUT_MS') ?? 8000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        // Le token voyage dans l'en-tête : jamais en query string (journaux
        // d'accès), jamais dans le corps (traces d'erreur des clients HTTP).
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
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
      // Auth par en-tête (posé dans le constructeur) : le corps ne porte que
      // les données d'envoi. `recipient` accepte plusieurs numéros séparés par
      // une virgule ; ici l'interface n'en transmet qu'un.
      const { data } = await this.http.post('/sms/send', {
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

  /** Solde SMSPro (data.remaining_balance, ex. « 80 FCFA ») - best-effort. */
  async getBalance(): Promise<ProviderBalance> {
    if (!this.token) {
      return { provider: this.name, available: false, display: null };
    }
    try {
      // Auth par en-tête : plus de `api_token` en query string.
      const { data } = await this.http.get('/balance');
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
