import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import * as crypto from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { AppConfigService } from 'src/config/config.service';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';
import { SokaPayTransactionEntity } from './entities/sokapay-transaction.entity';
import { CreateCheckoutDto } from './dto/create-checkout.dto';

/** Types d'événements terminaux signés émis par SOKA Pay. */
const PAID_EVENTS = ['payment.successful', 'session.completed', 'link.paid'];
const PAID_STATUSES = ['successful', 'completed', 'paid'];

export interface SokaPayEvent {
  id: string;
  type: string;
  createdAt: string;
  data: Record<string, any>;
}

@Injectable()
export class SokaPayService {
  private readonly logger = new Logger(SokaPayService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: AppConfigService,
    @InjectRepository(SokaPayTransactionEntity)
    private readonly txRepo: Repository<SokaPayTransactionEntity>,
    @InjectRepository(SubscriptionPaymentEntity)
    private readonly subPayRepo: Repository<SubscriptionPaymentEntity>,
  ) {}

  // ---------------------------------------------------------------------------
  //  Création de checkout (session OU lien) via l'API marchande SOKA Pay
  // ---------------------------------------------------------------------------

  async createCheckout(
    dto: CreateCheckoutDto,
    actorUuid?: string,
  ): Promise<{ url: string; transactionUuid: string; mode: 'link' | 'session'; providerId: string }> {
    this.requireApiConfig();
    const mode = dto.mode ?? 'link';
    const txUuid = uuidv4();
    const callbackUrl = this.config.sokaPayCallbackUrl;
    const reference = dto.reference ?? dto.memberUuid ?? txUuid;
    const metadata = {
      sokapayTxUuid: txUuid,
      memberUuid: dto.memberUuid ?? null,
      subscriptionUuid: dto.subscriptionUuid ?? null,
      subscriptionPaymentUuid: dto.subscriptionPaymentUuid ?? null,
      actorUuid: actorUuid ?? null,
    };

    let providerId: string;
    let url: string;
    let amount: number;

    if (mode === 'session') {
      if (!dto.amount) throw new BadRequestException('Le montant est requis pour une session.');
      const data = await this.gatewayPost('/api/v1/payment-sessions', {
        amount: dto.amount,
        currency: dto.currency,
        customerReference: reference,
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
        callbackUrl,
        metadata,
      });
      providerId = data.id;
      url = data.checkoutUrl;
      amount = data.amount ?? dto.amount;
    } else {
      const data = await this.gatewayPost('/api/v1/payment-links', {
        title: dto.title,
        amount: dto.amount ?? null, // null = montant libre
        description: dto.description,
        currency: dto.currency,
        successUrl: dto.successUrl,
        cancelUrl: dto.cancelUrl,
        callbackUrl,
        reusable: dto.reusable ?? false,
        metadata,
      });
      providerId = data.id;
      url = data.url;
      amount = data.amount ?? dto.amount ?? 0;
    }

    const tx = this.txRepo.create({
      uuid: txUuid,
      provider_session_id: mode === 'session' ? providerId : null,
      provider_link_id: mode === 'link' ? providerId : null,
      provider_payment_id: null,
      last_event_id: null,
      reference,
      member_uuid: dto.memberUuid ?? null,
      subscription_uuid: dto.subscriptionUuid ?? null,
      subscription_payment_uuid: dto.subscriptionPaymentUuid ?? null,
      amount: amount ?? dto.amount ?? 0,
      currency: dto.currency ?? 'XOF',
      provider: null,
      status: GlobalStatus.PENDING,
      checkout_url: url,
      raw_event: null,
    });
    await this.txRepo.save(tx);

    return { url, transactionUuid: txUuid, mode, providerId };
  }

  /** Vue d'une transaction de liaison (pour le front SOKA : polling de statut). */
  async getTransaction(uuid: string) {
    const tx = await this.txRepo.findOne({ where: { uuid } });
    if (!tx) throw new NotFoundException('Transaction SOKA Pay introuvable.');
    return {
      uuid: tx.uuid,
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      provider: tx.provider,
      url: tx.checkout_url,
      providerSessionId: tx.provider_session_id,
      providerLinkId: tx.provider_link_id,
      providerPaymentId: tx.provider_payment_id,
      memberUuid: tx.member_uuid,
      createdAt: tx.created_at,
      updatedAt: tx.updated_at,
    };
  }

  /** Statut d'un paiement côté SOKA Pay (relais lecture). */
  async getPayment(paymentId: string): Promise<unknown> {
    this.requireApiConfig();
    const url = `${this.config.sokaPayBaseUrl}/api/v1/payments/${encodeURIComponent(paymentId)}`;
    try {
      const res = await firstValueFrom(
        this.http.get(url, { headers: { Authorization: `Bearer ${this.config.sokaPayApiKey}` } }),
      );
      return res.data;
    } catch (err) {
      throw this.toHttpException(err as AxiosError);
    }
  }

  // ---------------------------------------------------------------------------
  //  Webhook entrant signé : vérification + application idempotente
  // ---------------------------------------------------------------------------

  /** Vérifie `Soka-Pay-Signature = HMAC-SHA256(corps_brut, secret)` en temps constant. */
  verifySignature(rawBody: Buffer | string, signature: string | undefined | null, secret: string): boolean {
    if (!signature || !secret || !rawBody) return false;
    const body = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
    const a = Buffer.from(signature, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Traite un webhook brut : vérifie la signature, parse, applique l'événement.
   * Lève 401 si la signature est invalide, 503 si le secret n'est pas configuré.
   */
  async handleWebhook(rawBody: Buffer | undefined, signature: string | undefined | null) {
    const secret = this.config.sokaPayWebhookSecret;
    if (!secret) throw new ServiceUnavailableException('SOKA_PAY_WEBHOOK_SECRET non configuré.');
    if (!rawBody) throw new BadRequestException('Corps brut indisponible (rawBody requis).');
    if (!this.verifySignature(rawBody, signature, secret)) {
      throw new UnauthorizedException('Signature SOKA Pay invalide.');
    }
    let event: SokaPayEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8'));
    } catch {
      throw new BadRequestException('Corps JSON invalide.');
    }
    return this.applyWebhookEvent(event);
  }

  /**
   * Applique un événement (déjà vérifié) à la transaction de liaison.
   * IDEMPOTENT : un même `event.id` n'est appliqué qu'une fois ; la transition de
   * statut est gardée (PENDING→SUCCESS/FAILED) ⇒ pas de double comptage au rejeu.
   */
  async applyWebhookEvent(
    event: SokaPayEvent,
  ): Promise<{ received: true; matched: boolean; duplicate: boolean; status?: string }> {
    const data = event?.data ?? {};
    const linkId: string | null = data.linkId ?? null;
    const sessionId: string | null = data.sessionId ?? null;

    let tx: SokaPayTransactionEntity | null = null;
    if (linkId) tx = await this.txRepo.findOne({ where: { provider_link_id: linkId } });
    if (!tx && sessionId) tx = await this.txRepo.findOne({ where: { provider_session_id: sessionId } });
    if (!tx) {
      this.logger.warn(`Webhook SOKA Pay non rattaché (link=${linkId} session=${sessionId}).`);
      return { received: true, matched: false, duplicate: false };
    }

    // Idempotence stricte : même événement déjà appliqué.
    if (tx.last_event_id && tx.last_event_id === event.id) {
      return { received: true, matched: true, duplicate: true, status: tx.status };
    }

    const type = String(event.type ?? '');
    const dataStatus = String(data.status ?? '');
    const isPaid = PAID_EVENTS.includes(type) || PAID_STATUSES.includes(dataStatus);
    const isFailed = type === 'payment.failed' || dataStatus === 'failed';

    if (isPaid) {
      const result = await this.txRepo.update(
        { uuid: tx.uuid, status: Not(GlobalStatus.SUCCESS) },
        {
          status: GlobalStatus.SUCCESS,
          provider_payment_id: data.paymentId ?? tx.provider_payment_id,
          provider: data.provider ?? tx.provider,
          amount: typeof data.amount === 'number' ? data.amount : tx.amount,
          last_event_id: event.id,
          raw_event: event,
        },
      );
      const transitioned = (result.affected ?? 0) > 0;
      if (transitioned && tx.subscription_payment_uuid) {
        await this.markSubscriptionPaid(tx.subscription_payment_uuid);
      }
      return { received: true, matched: true, duplicate: false, status: GlobalStatus.SUCCESS };
    }

    if (isFailed) {
      // N'écrase jamais un succès : on ne passe en échec que depuis PENDING.
      await this.txRepo.update(
        { uuid: tx.uuid, status: GlobalStatus.PENDING },
        { status: GlobalStatus.FAILED, last_event_id: event.id, raw_event: event },
      );
      return { received: true, matched: true, duplicate: false, status: GlobalStatus.FAILED };
    }

    // Événement non terminal : on note seulement l'event id.
    await this.txRepo.update({ uuid: tx.uuid }, { last_event_id: event.id });
    return { received: true, matched: true, duplicate: false, status: tx.status };
  }

  // ---------------------------------------------------------------------------
  //  Helpers
  // ---------------------------------------------------------------------------

  /** Marque la cotisation interne liée comme réglée (best-effort, idempotent). */
  private async markSubscriptionPaid(subscriptionPaymentUuid: string): Promise<void> {
    try {
      await this.subPayRepo.update(
        { uuid: subscriptionPaymentUuid, status: Not(GlobalStatus.SUCCESS) },
        { status: GlobalStatus.SUCCESS },
      );
    } catch (err) {
      this.logger.warn(
        `Cotisation ${subscriptionPaymentUuid} non mise à jour : ${(err as Error).message}`,
      );
    }
  }

  private async gatewayPost(path: string, body: Record<string, unknown>): Promise<any> {
    const url = `${this.config.sokaPayBaseUrl}${path}`;
    try {
      const res = await firstValueFrom(
        this.http.post(url, body, {
          headers: {
            Authorization: `Bearer ${this.config.sokaPayApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        }),
      );
      return res.data;
    } catch (err) {
      throw this.toHttpException(err as AxiosError);
    }
  }

  private requireApiConfig(): void {
    if (!this.config.sokaPayBaseUrl || !this.config.sokaPayApiKey) {
      throw new ServiceUnavailableException(
        'SOKA Pay non configuré (SOKA_PAY_BASE_URL / SOKA_PAY_API_KEY).',
      );
    }
  }

  private toHttpException(err: AxiosError): HttpException {
    const data = err.response?.data as { error?: { message?: string } } | undefined;
    const message = data?.error?.message ?? err.message ?? 'Erreur SOKA Pay';
    const status = err.response?.status;
    const httpStatus =
      status && status >= 400 && status < 500 ? status : HttpStatus.BAD_GATEWAY;
    return new HttpException(`SOKA Pay : ${message}`, httpStatus);
  }
}
