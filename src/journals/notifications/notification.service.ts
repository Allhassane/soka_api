import { Injectable } from '@nestjs/common';
import { TextoSmsProvider } from './texto-sms.provider';
import {
  SendMessageInput,
  SendMessageResult,
} from '../interfaces/sms-provider.interface';

/**
 * Service de notification (façade) - délègue au provider TextO.
 * Permet à terme de switcher de provider sans toucher au service métier.
 */
@Injectable()
export class NotificationService {
  constructor(private readonly textoProvider: TextoSmsProvider) {}

  async send(input: SendMessageInput): Promise<SendMessageResult> {
    return this.textoProvider.send(input);
  }
}
