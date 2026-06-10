import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  NotificationProvider,
  SendMessageInput,
  SendMessageResult,
} from '../interfaces/sms-provider.interface';
import { NotificationChannel } from '../entities/journal-distribution.entity';

/**
 * Provider d'envoi SMS / WhatsApp via TextO.
 * Paramètres lus depuis .env :
 *  - TEXTO_BASE_URL     (ex: https://api.texto.ci/api/v1)
 *  - TEXTO_API_KEY      (clé API / token bearer)
 *  - TEXTO_CLIENT_ID    (optionnel — identifiant client)
 *  - TEXTO_SENDER       (sender ID alphanumérique, ex: SOKA)
 *  - TEXTO_SMS_PATH     (chemin endpoint SMS, défaut: /sms/send)
 *  - TEXTO_WA_PATH      (chemin endpoint WhatsApp, défaut: /whatsapp/send)
 *  - TEXTO_TIMEOUT_MS   (défaut: 10000)
 *  - TEXTO_ENABLED      ('true' pour activer l'envoi réel ; sinon mode log uniquement)
 */
@Injectable()
export class TextoSmsProvider implements NotificationProvider {
  public readonly name = 'texto';
  private readonly logger = new Logger(TextoSmsProvider.name);
  private readonly http: AxiosInstance;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly clientId: string;
  private readonly sender: string;
  private readonly smsPath: string;
  private readonly waPath: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = this.config.get<string>('TEXTO_BASE_URL') ?? '';
    this.apiKey = this.config.get<string>('TEXTO_API_KEY') ?? '';
    this.clientId = this.config.get<string>('TEXTO_CLIENT_ID') ?? '';
    this.sender = this.config.get<string>('TEXTO_SENDER') ?? 'SOKA';
    this.smsPath = this.config.get<string>('TEXTO_SMS_PATH') ?? '/sms/send';
    this.waPath = this.config.get<string>('TEXTO_WA_PATH') ?? '/whatsapp/send';
    this.enabled =
      (this.config.get<string>('TEXTO_ENABLED') ?? 'false').toLowerCase() ===
      'true';

    this.http = axios.create({
      baseURL: this.baseUrl,
      timeout: Number(this.config.get<string>('TEXTO_TIMEOUT_MS') ?? 10000),
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
    });
  }

  /** Normalise un numéro CI au format international 225XXXXXXXXXX */
  private normalizePhone(raw: string): string {
    if (!raw) return '';
    const digits = raw.replace(/[^0-9]/g, '');
    if (digits.startsWith('00')) return digits.substring(2);
    if (digits.startsWith('225')) return digits;
    if (digits.length === 10 && digits.startsWith('0')) return `225${digits.substring(1)}`;
    if (digits.length === 10) return `225${digits}`;
    return digits;
  }

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    const to = this.normalizePhone(input.to);
    const channel = input.channel ?? NotificationChannel.SMS;

    if (!to) {
      return {
        success: false,
        provider: this.name,
        error: 'Numéro destinataire vide ou invalide',
      };
    }

    // Mode dégradé : pas d'envoi réel — on logge et on rapporte succès simulé.
    if (!this.enabled || !this.baseUrl || !this.apiKey) {
      this.logger.warn(
        `[TextO][SIMULATION] channel=${channel} to=${to} ref=${input.reference ?? '-'} :: ${input.message}`,
      );
      return {
        success: true,
        provider: this.name,
        provider_message_id: `sim-${Date.now()}`,
        raw_response: { simulated: true },
      };
    }

    const path =
      channel === NotificationChannel.WHATSAPP ? this.waPath : this.smsPath;

    const payload: Record<string, any> = {
      from: this.sender,
      to,
      message: input.message,
      reference: input.reference,
      ...(this.clientId ? { client_id: this.clientId } : {}),
    };

    try {
      const { data } = await this.http.post(path, payload);
      return {
        success: true,
        provider: this.name,
        provider_message_id:
          data?.message_id ?? data?.id ?? data?.data?.id ?? undefined,
        raw_response: data,
      };
    } catch (err: any) {
      const errorMessage =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err?.message ??
        'Erreur inconnue TextO';
      this.logger.error(
        `[TextO][ERROR] channel=${channel} to=${to} :: ${errorMessage}`,
      );
      return {
        success: false,
        provider: this.name,
        error: errorMessage,
        raw_response: err?.response?.data,
      };
    }
  }
}
