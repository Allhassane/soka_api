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
}

export interface NotificationProvider {
  readonly name: string;
  send(input: SendMessageInput): Promise<SendMessageResult>;
}
