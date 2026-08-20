import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface SmsResult {
  success: boolean;
  provider_message_id?: string;
  error?: string;
  simulated?: boolean;
}

/**
 * Service d'envoi de SMS via LeTexto (apis.letexto.com/v1).
 * Référence d'intégration : dossier `sms-api/` à la racine du projet.
 *
 * Config `.env` :
 *  - LETEXTO_API_KEY    (clé Bearer)
 *  - LETEXTO_BASE_URL   (défaut https://apis.letexto.com/v1)
 *  - LETEXTO_SENDER     (Sender ID VALIDÉ, défaut « SOKA CI » depuis le 2026-08-19)
 *  - LETEXTO_ENABLED    ('true' = envoi réel ; sinon SIMULATION/log - pas de crédits consommés)
 *  - LETEXTO_TIMEOUT_MS (défaut 10000)
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly http: AxiosInstance;
  private readonly apiKey: string;
  private readonly sender: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.apiKey = (this.config.get<string>('LETEXTO_API_KEY') ?? '').trim();
    this.sender = this.config.get<string>('LETEXTO_SENDER') ?? 'SOKA CI';
    this.enabled =
      (this.config.get<string>('LETEXTO_ENABLED') ?? 'false').toLowerCase() ===
      'true';

    this.http = axios.create({
      baseURL:
        this.config.get<string>('LETEXTO_BASE_URL') ??
        'https://apis.letexto.com/v1',
      timeout: Number(this.config.get<string>('LETEXTO_TIMEOUT_MS') ?? 10000),
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
      },
    });
  }

  /**
   * Normalise un numéro CI au format international LeTexto.
   * Plan ivoirien à 10 chiffres (depuis 2021) : le format attendu est
   * `225` + le numéro local à 10 chiffres EN GARDANT son `0` (ex. 2250749326623).
   * Réf. : sms-api/README.md (« 0749326623 -> 2250749326623 »).
   */
  normalizePhone(raw: string): string {
    if (!raw) return '';
    let digits = raw.replace(/[^0-9]/g, '');
    // Préfixe international composé avec 00 -> on le retire.
    if (digits.startsWith('00')) digits = digits.slice(2);
    // Repart toujours du numéro LOCAL (retire un éventuel indicatif 225 déjà présent).
    let local = digits.startsWith('225') ? digits.slice(3) : digits;
    // Auto-répare un numéro qui aurait perdu son 0 de tête (9 chiffres -> 10).
    if (local.length === 9) local = `0${local}`;
    // Cas nominal : 10 chiffres commençant par 0 -> 225 + numéro local complet.
    if (local.length === 10 && local.startsWith('0')) return `225${local}`;
    // Cas non reconnu : on préfixe 225 si purement local, sinon on renvoie tel quel.
    return digits.startsWith('225') ? digits : `225${local}`;
  }

  /**
   * Envoie un SMS via LeTexto.
   * En mode non-activé (dev), SIMULE l'envoi (log) sans appeler l'API - aucun crédit consommé.
   */
  async sendSms(
    to: string,
    content: string,
    reference?: string,
  ): Promise<SmsResult> {
    const dest = this.normalizePhone(to);
    if (!dest) {
      return { success: false, error: 'Numéro destinataire vide ou invalide' };
    }

    if (!this.enabled || !this.apiKey) {
      this.logger.warn(
        `[LeTexto][SIMULATION] to=${dest} ref=${reference ?? '-'} :: ${content}`,
      );
      return { success: true, simulated: true, provider_message_id: `sim-${Date.now()}` };
    }

    try {
      const { data } = await this.http.post('/messages/send', {
        from: this.sender,
        to: dest,
        content,
        ...(reference ? { customData: reference } : {}),
      });
      return {
        success: true,
        provider_message_id: data?.id ?? data?.data?.id ?? undefined,
      };
    } catch (err: any) {
      const error =
        err?.response?.data?.message ??
        err?.response?.data?.error ??
        err?.message ??
        'Erreur LeTexto';
      this.logger.error(`[LeTexto][ERROR] to=${dest} :: ${error}`);
      return { success: false, error };
    }
  }
}
