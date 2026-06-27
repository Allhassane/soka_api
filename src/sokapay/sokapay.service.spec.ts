/// <reference types="jest" />
// Le tsconfig du projet limite `types` à ["node","multer"] (les globals Jest ne
// sont donc pas inclus par défaut) : on les réintroduit ICI, sans toucher au
// tsconfig global (build de l'app inchangé).
import { UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { of } from 'rxjs';
import * as crypto from 'node:crypto';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { SokaPayService } from './sokapay.service';

const SECRET = 'whsec_test_secret';

function makeService(over: { txFindOne?: any; updateAffected?: number } = {}) {
  const http = { post: jest.fn(), get: jest.fn() };
  const config = {
    sokaPayBaseUrl: 'http://localhost:3001',
    sokaPayApiKey: 'sk_sandbox_test',
    sokaPayWebhookSecret: SECRET,
    sokaPayCallbackUrl: 'http://localhost:3013/api/webhooks/soka-pay',
  };
  const txRepo = {
    create: jest.fn((x: any) => x),
    save: jest.fn(async (x: any) => x),
    findOne: jest.fn(async () => over.txFindOne ?? null),
    update: jest.fn(async (_where?: any, _set?: any) => ({ affected: over.updateAffected ?? 1 })),
  };
  const subPayRepo = { update: jest.fn(async () => ({ affected: 1 })) };
  const service = new SokaPayService(http as any, config as any, txRepo as any, subPayRepo as any);
  return { service, http, txRepo, subPayRepo, config };
}

function sign(body: string, secret = SECRET): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

describe('SokaPayService - signature', () => {
  it('verifySignature accepte une signature valide et rejette une invalide', () => {
    const { service } = makeService();
    const raw = JSON.stringify({ id: 'evt_1', type: 'link.paid', data: {} });
    expect(service.verifySignature(raw, sign(raw), SECRET)).toBe(true);
    expect(service.verifySignature(raw, 'deadbeef', SECRET)).toBe(false);
    expect(service.verifySignature(raw, undefined, SECRET)).toBe(false);
  });

  it('handleWebhook : 401 si signature invalide', async () => {
    const { service } = makeService();
    const raw = Buffer.from(JSON.stringify({ id: 'evt_1', type: 'link.paid', data: {} }));
    await expect(service.handleWebhook(raw, 'mauvaise-signature')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('handleWebhook : 503 si secret non configuré', async () => {
    const { service, config } = makeService();
    (config as any).sokaPayWebhookSecret = '';
    const raw = Buffer.from('{}');
    await expect(service.handleWebhook(raw, 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('handleWebhook : signature valide → applique l’événement', async () => {
    const tx = { uuid: 'tx-1', provider_link_id: 'plink_1', status: GlobalStatus.PENDING, last_event_id: null, subscription_payment_uuid: null };
    const { service, txRepo } = makeService({ txFindOne: tx });
    const body = JSON.stringify({ id: 'evt_1', type: 'link.paid', createdAt: 'now', data: { linkId: 'plink_1', status: 'paid', paymentId: 'pay_1' } });
    const raw = Buffer.from(body);
    const res = await service.handleWebhook(raw, sign(body));
    expect(res).toMatchObject({ received: true, matched: true, status: GlobalStatus.SUCCESS });
    expect(txRepo.update).toHaveBeenCalled();
  });
});

describe('SokaPayService - idempotence du webhook', () => {
  it('paiement réussi : transition PENDING → SUCCESS (gardée) + marque la cotisation', async () => {
    const tx = {
      uuid: 'tx-1',
      provider_link_id: 'plink_1',
      provider_session_id: null,
      status: GlobalStatus.PENDING,
      last_event_id: null,
      subscription_payment_uuid: 'subpay-9',
      provider_payment_id: null,
      amount: 1000,
      provider: null,
    };
    const { service, txRepo, subPayRepo } = makeService({ txFindOne: tx, updateAffected: 1 });
    const event = { id: 'evt_paid', type: 'link.paid', createdAt: 'now', data: { linkId: 'plink_1', status: 'paid', paymentId: 'pay_1', provider: 'wave', amount: 1000 } };

    const res = await service.applyWebhookEvent(event as any);
    expect(res.status).toBe(GlobalStatus.SUCCESS);
    // update gardée par status != SUCCESS
    const [where, set] = txRepo.update.mock.calls[0];
    expect(where).toMatchObject({ uuid: 'tx-1' });
    expect(set).toMatchObject({ status: GlobalStatus.SUCCESS, provider_payment_id: 'pay_1', last_event_id: 'evt_paid' });
    // cotisation liée marquée réglée
    expect(subPayRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: 'subpay-9' }),
      expect.objectContaining({ status: GlobalStatus.SUCCESS }),
    );
  });

  it('rejeu du MÊME événement : duplicate, aucune écriture (pas de double comptage)', async () => {
    const tx = { uuid: 'tx-1', provider_link_id: 'plink_1', status: GlobalStatus.SUCCESS, last_event_id: 'evt_paid', subscription_payment_uuid: null };
    const { service, txRepo, subPayRepo } = makeService({ txFindOne: tx });
    const event = { id: 'evt_paid', type: 'link.paid', createdAt: 'now', data: { linkId: 'plink_1', status: 'paid' } };

    const res = await service.applyWebhookEvent(event as any);
    expect(res).toMatchObject({ duplicate: true, matched: true });
    expect(txRepo.update).not.toHaveBeenCalled();
    expect(subPayRepo.update).not.toHaveBeenCalled();
  });

  it('transaction introuvable : matched=false, pas d’erreur', async () => {
    const { service } = makeService({ txFindOne: null });
    const event = { id: 'evt_x', type: 'link.paid', createdAt: 'now', data: { linkId: 'plink_inconnu' } };
    const res = await service.applyWebhookEvent(event as any);
    expect(res).toMatchObject({ received: true, matched: false });
  });

  it('échec de paiement : PENDING → FAILED (n’écrase pas un succès)', async () => {
    const tx = { uuid: 'tx-2', provider_session_id: 'psess_2', provider_link_id: null, status: GlobalStatus.PENDING, last_event_id: null, subscription_payment_uuid: null };
    const { service, txRepo } = makeService({ txFindOne: tx });
    const event = { id: 'evt_fail', type: 'payment.failed', createdAt: 'now', data: { sessionId: 'psess_2', status: 'failed' } };
    const res = await service.applyWebhookEvent(event as any);
    expect(res.status).toBe(GlobalStatus.FAILED);
    const [where, set] = txRepo.update.mock.calls[0];
    expect(where).toMatchObject({ uuid: 'tx-2', status: GlobalStatus.PENDING });
    expect(set).toMatchObject({ status: GlobalStatus.FAILED });
  });
});

describe('SokaPayService - createCheckout', () => {
  it('mode lien : appelle la gateway et renvoie une url, transaction PENDING persistée', async () => {
    const { service, http, txRepo } = makeService();
    http.post.mockReturnValue(of({ data: { id: 'plink_new', url: 'http://localhost:5173/l/plink_new', amount: 1000 } }));

    const res = await service.createCheckout(
      { title: 'Cotisation', amount: 1000, memberUuid: 'm-1', subscriptionPaymentUuid: 'sp-1' } as any,
      'admin-1',
    );

    expect(res.url).toBe('http://localhost:5173/l/plink_new');
    expect(res.mode).toBe('link');
    // appel gateway avec Bearer + callbackUrl + metadata
    const [url, body, conf] = http.post.mock.calls[0];
    expect(url).toContain('/api/v1/payment-links');
    expect((conf as any).headers.Authorization).toContain('Bearer ');
    expect((body as any).callbackUrl).toContain('/api/webhooks/soka-pay');
    expect((body as any).metadata.memberUuid).toBe('m-1');
    // transaction persistée en PENDING
    const saved = txRepo.save.mock.calls[0][0];
    expect(saved).toMatchObject({ provider_link_id: 'plink_new', status: GlobalStatus.PENDING, member_uuid: 'm-1' });
  });
});
