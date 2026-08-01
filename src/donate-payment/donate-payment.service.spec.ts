import { NotFoundException } from '@nestjs/common';
import { DonatePaymentService } from './donate-payment.service';

/**
 * CONTRAT DE STATUT entre `POST /donate-payments/hub/check/status/:id` et le web.
 *
 * ⚠️ Ces chaînes traversent la frontière des deux dépôts : elles sont lues
 * telles quelles par `web/services/subscription.ts`
 * (`isHubPaymentConfirmed` teste `data.status === 'paid'`,
 *  `isHubPaymentPending` teste `data.status === 'pending'`).
 * Rien côté TypeScript ne relie les deux : une faute de frappe ou un renommage
 * ici compilerait des deux côtés et **casserait l'écran de résultat en silence**
 * - exactement le mode de panne du 2026-08-01. Ce test est le garde-fou.
 *
 * Si un libellé doit changer, il faut modifier LES DEUX dépôts dans le même lot.
 */
describe('DonatePaymentService.confirmHubPayment - libellés de statut (contrat web)', () => {
  const paymentService = {
    findByTransactionIdOrFail: jest.fn().mockResolvedValue({ uuid: 'pay-uuid' }),
    syncHubPaymentByTransactionId: jest.fn(),
  };

  const service = new DonatePaymentService(
    null as never, // donateRepo
    null as never, // donateCampaignRepo
    null as never, // subscriptionPaymentRepo
    null as never, // logService
    null as never, // userRepo
    null as never, // memberRepo
    paymentService as never, // paymentService
    null as never, // hubService
    null as never, // accessScopeService
    null as never, // effectivePermissions (jamais atteint : confirmHubPayment ne contrôle pas de tiers)
  );

  beforeEach(() => {
    jest.clearAllMocks();
    paymentService.findByTransactionIdOrFail.mockResolvedValue({ uuid: 'pay-uuid' });
  });

  it('paiement confirmé ⇒ status EXACTEMENT "paid" et success true', async () => {
    paymentService.syncHubPaymentByTransactionId.mockResolvedValue({
      status: 'paid',
      transaction_id: 'plink_1',
      donation_uuid: null,
      hub_payment: { status: 'successful', amount: 100, currency: 'XOF' },
    });

    const res = (await service.confirmHubPayment({ transaction_id: 'plink_1' }, '')) as {
      success: boolean;
      status: string;
      hub_payment: unknown;
    };

    expect(res.status).toBe('paid');
    expect(res.success).toBe(true);
    // Le détail doit être transmis : le web s'en sert pour le montant/l'opérateur.
    expect(res.hub_payment).not.toBeNull();
  });

  it('paiement en attente ⇒ status EXACTEMENT "pending", success false, PAS d\'exception', async () => {
    paymentService.syncHubPaymentByTransactionId.mockResolvedValue({
      status: 'pending',
      transaction_id: 'plink_2',
      donation_uuid: null,
      hub_payment: { status: 'pending' },
    });

    // Une exception (l'ancien comportement) arrivait au front comme une erreur
    // réseau indifférenciée ⇒ écran « paiement non abouti » sur un paiement en cours.
    const res = (await service.confirmHubPayment({ transaction_id: 'plink_2' }, '')) as {
      success: boolean;
      status: string;
    };

    expect(res.status).toBe('pending');
    expect(res.success).toBe(false);
  });

  it('paiement échoué ⇒ status EXACTEMENT "failed", success false, PAS d\'exception', async () => {
    paymentService.syncHubPaymentByTransactionId.mockResolvedValue({
      status: 'failed',
      transaction_id: 'plink_3',
      donation_uuid: null,
      hub_payment: { status: 'failed', failureCode: 'authentication_failed' },
    });

    const res = (await service.confirmHubPayment({ transaction_id: 'plink_3' }, '')) as {
      success: boolean;
      status: string;
    };

    expect(res.status).toBe('failed');
    expect(res.success).toBe(false);
  });

  it('transaction inconnue ⇒ 404 (seul cas qui reste une exception)', async () => {
    paymentService.syncHubPaymentByTransactionId.mockResolvedValue({
      status: 'not_found',
      transaction_id: 'plink_x',
    });

    await expect(
      service.confirmHubPayment({ transaction_id: 'plink_x' }, ''),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('les 3 libellés attendus par le web sont bien ceux émis', async () => {
    const attendusParLeWeb = ['paid', 'pending', 'failed'];
    const emis: string[] = [];

    for (const status of attendusParLeWeb) {
      paymentService.syncHubPaymentByTransactionId.mockResolvedValue({
        status,
        transaction_id: 'plink_c',
        donation_uuid: null,
        hub_payment: null,
      });
      const res = (await service.confirmHubPayment({ transaction_id: 'plink_c' }, '')) as {
        status: string;
      };
      emis.push(res.status);
    }

    expect(emis).toEqual(attendusParLeWeb);
  });
});
