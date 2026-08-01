import { PaymentService } from './payment.service';
import { PaymentEntity, PaymentStatus } from './entities/payment.entity';

/**
 * RÉGRESSION (constatée en production le 2026-08-01) : l'écran de résultat
 * affichait « Paiement non abouti » pour un paiement pourtant encaissé, dès qu'on
 * l'ouvrait une SECONDE fois (deuxième appareil après un QR code Wave, ou simple F5).
 *
 * Mécanique : `syncHubPaymentByTransactionId` a deux chemins. Le premier appel
 * trouve le paiement `PENDING`, interroge HUB, persiste `PAID` et renvoie le détail
 * HUB. Le second appel sort en amont (paiement déjà `PAID`) et renvoyait
 * `hub_payment: null` - alors que le web conditionnait son verdict de succès à
 * `hub_payment.status === 'successful'`.
 *
 * La réponse doit donc garder la MÊME FORME quel que soit le chemin emprunté.
 */
const hubService = { checkPaymentStatus: jest.fn(), cancelPaymentLink: jest.fn() };

/** Instancie le service avec la seule dépendance utile : le dépôt `payments`. */
function makeService(payment: Partial<PaymentEntity> | null) {
  const paymentRepo = { findOne: jest.fn().mockResolvedValue(payment) };
  const emptyRepo = { findOne: jest.fn().mockResolvedValue(null) };

  return new PaymentService(
    paymentRepo as never, // paymentRepo
    null as never, // memberRepo
    null as never, // subscriptionRepo
    null as never, // donationRepo
    emptyRepo as never, // donatePaymentRepo
    emptyRepo as never, // subscriptionPaymentRepo
    null as never, // exportJobService
    null as never, // exportProcessorService
    null as never, // userRepo
    null as never, // structureService
    null as never, // logService
    hubService as never, // hubService
    null as never, // accessScopeService
  );
}

describe('PaymentService.syncHubPaymentByTransactionId - réponses servies depuis la base', () => {
  beforeEach(() => jest.clearAllMocks());

  it('un paiement déjà PAYÉ renvoie un hub_payment (et ne rappelle pas HUB)', async () => {
    const service = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_abc',
      total_amount: 15000,
      payment_status: PaymentStatus.PAID,
    });

    const result = await service.syncHubPaymentByTransactionId('plink_abc');

    expect(result.status).toBe('paid');
    // Le cœur de la régression : sans ce détail, le web déclarait un échec.
    expect(result.hub_payment).not.toBeNull();
    expect(result.hub_payment).toMatchObject({
      status: 'successful',
      amount: 15000,
      currency: 'XOF',
    });
    // Statut local déjà définitif : inutile (et coûteux) de réinterroger HUB.
    expect(hubService.checkPaymentStatus).not.toHaveBeenCalled();
  });

  it('un paiement déjà ÉCHOUÉ renvoie lui aussi un hub_payment', async () => {
    const service = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_ko',
      total_amount: 100,
      payment_status: PaymentStatus.FAILED,
    });

    const result = await service.syncHubPaymentByTransactionId('plink_ko');

    expect(result.status).toBe('failed');
    expect(result.hub_payment).toMatchObject({ status: 'failed', amount: 100 });
    expect(hubService.checkPaymentStatus).not.toHaveBeenCalled();
  });

  it('transaction inconnue : ni hub_payment inventé, ni appel HUB', async () => {
    const service = makeService(null);

    const result = await service.syncHubPaymentByTransactionId('plink_inconnu');

    expect(result.status).toBe('not_found');
    expect(hubService.checkPaymentStatus).not.toHaveBeenCalled();
  });
});

/**
 * Bouton « Annuler » des listes Abonnements / Zaimu.
 *
 * Motif : un membre relance le paiement plusieurs fois ; une tentative aboutit et
 * les autres restent `pending`, donc **encore encaissables** (OTP ou lien Wave
 * toujours valides). L'annulation referme ces tentatives.
 *
 * ⚠️ Le risque à ne JAMAIS réintroduire est l'inverse : annuler une tentative qui
 * a en réalité abouti effacerait la trace d'un vrai paiement. D'où les gardes
 * ci-dessous, et l'ordre gateway-puis-base (la gateway interroge HUB2 et refuse).
 */
describe('PaymentService.cancelHubPaymentByTransactionId - gardes anti-annulation abusive', () => {
  beforeEach(() => jest.clearAllMocks());

  it('REFUSE d\'annuler un paiement déjà payé, sans même appeler la gateway', async () => {
    const service = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_ok',
      total_amount: 100,
      payment_status: PaymentStatus.PAID,
    });

    await expect(
      service.cancelHubPaymentByTransactionId('plink_ok'),
    ).rejects.toThrow(/abouti/i);
    expect(hubService.cancelPaymentLink).not.toHaveBeenCalled();
  });

  it('tentative déjà close : idempotent, la gateway n\'est pas rappelée', async () => {
    const service = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_ko',
      total_amount: 100,
      payment_status: PaymentStatus.CANCELLED,
    });

    const res = await service.cancelHubPaymentByTransactionId('plink_ko');

    expect(res.message).toMatch(/déjà close/i);
    expect(hubService.cancelPaymentLink).not.toHaveBeenCalled();
  });

  it('transaction inconnue ⇒ 404, sans appel gateway', async () => {
    const service = makeService(null);

    await expect(
      service.cancelHubPaymentByTransactionId('plink_inconnu'),
    ).rejects.toThrow();
    expect(hubService.cancelPaymentLink).not.toHaveBeenCalled();
  });

  it('la gateway découvre un paiement abouti ⇒ RIEN n\'est marqué annulé', async () => {
    const service = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_race',
      total_amount: 100,
      payment_status: PaymentStatus.PENDING,
    });
    hubService.cancelPaymentLink.mockResolvedValue({
      canceled: false,
      reason: 'already_paid',
      link: 'active',
    });
    const updateSpy = jest
      .spyOn(service, 'updatePayment')
      .mockResolvedValue(undefined as never);
    jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'paid', transaction_id: 'plink_race' } as never);

    const res = await service.cancelHubPaymentByTransactionId('plink_race');

    expect(res.status).toBe('paid');
    expect(res.message).toMatch(/abouti/i);
    // Le point critique : aucune écriture « annulé » sur un paiement encaissé.
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('cas nominal : la tentative est marquée annulée APRÈS accord de la gateway', async () => {
    const service = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_pending',
      total_amount: 100,
      payment_status: PaymentStatus.PENDING,
    });
    hubService.cancelPaymentLink.mockResolvedValue({
      canceled: true,
      reason: 'canceled',
      link: 'disabled',
      sessions_canceled: 2,
      intents_canceled: 2,
    });
    const updateSpy = jest
      .spyOn(service, 'updatePayment')
      .mockResolvedValue(undefined as never);

    const res = await service.cancelHubPaymentByTransactionId('plink_pending');

    expect(hubService.cancelPaymentLink).toHaveBeenCalledWith('plink_pending');
    expect(updateSpy).toHaveBeenCalledWith(
      'pay-uuid',
      expect.objectContaining({ payment_status: PaymentStatus.CANCELLED }),
    );
    expect(res.message).toMatch(/annulée/i);
  });
});
