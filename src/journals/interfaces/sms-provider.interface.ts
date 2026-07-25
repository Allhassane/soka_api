import { NotificationChannel } from '../entities/journal-distribution.entity';

export interface SendMessageInput {
  to: string;
  message: string;
  channel?: NotificationChannel;
  /** Identifiant fonctionnel pour tracer (ex: distribution_uuid) */
  reference?: string;
}

export interface SendMessageResult {
  success: boolean;
  provider: string;
  provider_message_id?: string;
  raw_response?: any;
  error?: string;
  /**
   * `true` quand AUCUN envoi réel n'a eu lieu (mode simulation : aucun fournisseur
   * réellement activable). Champ optionnel, rétro-compatible. Le `SmsDispatcher`
   * s'en sert pour refuser une « réussite » simulée sur le chemin d'auth en prod
   * (sinon un mot de passe serait persisté sans qu'aucun SMS ne parte).
   */
  simulated?: boolean;
}

export interface NotificationProvider {
  readonly name: string;
  send(input: SendMessageInput): Promise<SendMessageResult>;
}
