import { PaymentService } from './payment.service';
import { PaymentEntity, PaymentStatus } from './entities/payment.entity';

/**
 * Conservation du détail rendu par le guichet : opérateur, motif d'échec, encaissement.
 *
 * Le guichet renvoie ces champs à chaque vérification et l'API les jetait - d'où
 * l'impossibilité de dire par quel opérateur un paiement est passé, ou pourquoi il a
 * échoué. Ces tests verrouillent les règles qui rendent la capture sûre, parce qu'aucune
 * ne se devine à la lecture du code appelant.
 *
 * ⚠️ Les trois issues de la synchronisation (payé / échoué / en attente) sont couvertes,
 * et c'est délibéré : une revue a montré qu'une suite ne parcourant que l'issue « en
 * attente » restait VERTE si l'on déplaçait l'appel de capture dans cette seule branche -
 * auquel cas plus aucun motif d'échec ne serait jamais stocké en production, la
 * statistique « motifs d'échec » resterait vide pour toujours, et rien ne le signalerait.
 */
const hubService = { checkPaymentStatus: jest.fn(), cancelPaymentLink: jest.fn() };

function makeService(payment: Partial<PaymentEntity>, execute?: jest.Mock) {
  // L'écriture passe par le QueryBuilder (et non `repo.update`) pour pouvoir réaffecter
  // `updated_at` à sa propre valeur : le simulacre doit donc suivre la même chaîne.
  const qb = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    execute: execute ?? jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const paymentRepo = {
    findOne: jest.fn().mockResolvedValue(payment),
    save: jest.fn().mockImplementation((p) => Promise.resolve(p)),
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  const emptyRepo = { findOne: jest.fn().mockResolvedValue(null) };

  const service = new PaymentService(
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

  /** Le patch réellement envoyé à la base, ou `undefined` si rien n'a été écrit. */
  const patchEcrit = () => qb.set.mock.calls[0]?.[0];

  return { service, qb, patchEcrit };
}

/** Réponse du guichet pour une tentative encore ouverte (issue « en attente »). */
function enAttente(detail: Record<string, unknown> | null) {
  hubService.checkPaymentStatus.mockResolvedValue({ paid: false, payment: detail });
}

describe('PaymentService - capture du détail guichet', () => {
  beforeEach(() => jest.clearAllMocks());

  it('conserve opérateur, motif d\'échec et horodatage d\'encaissement', async () => {
    const { service, patchEcrit } = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_abc',
      total_amount: 15000,
      payment_status: PaymentStatus.PENDING,
    });

    enAttente({
      status: 'pending',
      provider: 'WAVE',
      paidAt: '2026-08-09T16:37:30.000Z',
      failureCode: 'wave_payment_expired',
      failureMessage: 'Le paiement a expiré',
    });

    await service.syncHubPaymentByTransactionId('plink_abc');

    const patch = patchEcrit();
    // L'opérateur est normalisé : le guichet n'est pas garanti constant sur la casse,
    // et les statistiques regroupent dessus.
    expect(patch.provider).toBe('wave');
    expect(patch.failure_code).toBe('wave_payment_expired');
    expect(patch.failure_message).toBe('Le paiement a expiré');
    expect(patch.paid_at).toEqual(new Date('2026-08-09T16:37:30.000Z'));
  });

  it('🚨 ne fait PAS bouger `updated_at` : la ligne n\'a rien changé sur le fond', async () => {
    // Le rattrapage écrit ces colonnes sur ~1 200 paiements clos depuis des semaines. Sans
    // cette réaffectation, tous porteraient la date du rattrapage et la vraie serait perdue.
    const { service, patchEcrit } = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_abc',
      payment_status: PaymentStatus.PENDING,
    });

    enAttente({ status: 'pending', provider: 'wave' });

    await service.syncHubPaymentByTransactionId('plink_abc');

    const patch = patchEcrit();
    expect(typeof patch.updated_at).toBe('function');
    // La colonne doit être affectée à ELLE-MÊME : c'est ce qui neutralise à la fois le
    // `ON UPDATE CURRENT_TIMESTAMP(6)` de MySQL et l'ajout automatique de TypeORM.
    expect(patch.updated_at()).toBe('`updated_at`');
  });

  it('n\'écrit rien quand le guichet ne connaît aucune tentative', async () => {
    const { service, qb } = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_vide',
      payment_status: PaymentStatus.PENDING,
    });

    enAttente(null);

    await service.syncHubPaymentByTransactionId('plink_vide');

    expect(qb.execute).not.toHaveBeenCalled();
  });

  it('🚨 un détail absent n\'EFFACE jamais un opérateur déjà connu', async () => {
    // Cas réel : HUB2 ne referme pas une tentative abandonnée, il répond `payment: null`
    // indéfiniment. Sans cette règle, la synchronisation suivante viderait l'opérateur
    // d'un paiement pourtant abouti.
    const { service, qb } = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_abc',
      payment_status: PaymentStatus.PENDING,
      provider: 'orange',
      failure_code: 'timeout',
      hub_payment_id: 'pay_deja_connu',
    });

    enAttente({ status: 'pending', provider: null, failureCode: null, id: null });

    await service.syncHubPaymentByTransactionId('plink_abc');

    expect(qb.execute).not.toHaveBeenCalled();
  });

  it('n\'écrit pas quand rien n\'a changé (le cron repasse toutes les 10 min)', async () => {
    const { service, qb } = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_abc',
      payment_status: PaymentStatus.PENDING,
      provider: 'wave',
      failure_code: 'timeout',
      failure_message: 'Délai dépassé',
      paid_at: new Date('2026-08-09T16:37:30.000Z'),
      hub_payment_id: 'pay_abc',
      hub_created_at: new Date('2026-08-09T16:30:00.000Z'),
    });

    enAttente({
      status: 'pending',
      provider: 'wave',
      failureCode: 'timeout',
      failureMessage: 'Délai dépassé',
      paidAt: '2026-08-09T16:37:30.000Z',
      id: 'pay_abc',
      createdAt: '2026-08-09T16:30:00.000Z',
    });

    await service.syncHubPaymentByTransactionId('plink_abc');

    expect(qb.execute).not.toHaveBeenCalled();
  });

  it('ignore une date d\'encaissement illisible plutôt que de la stocker', async () => {
    const { service, patchEcrit } = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_abc',
      payment_status: PaymentStatus.PENDING,
    });

    enAttente({ status: 'pending', provider: 'mtn', paidAt: 'pas-une-date' });

    await service.syncHubPaymentByTransactionId('plink_abc');

    const patch = patchEcrit();
    expect(patch.provider).toBe('mtn');
    expect(patch).not.toHaveProperty('paid_at');
  });

  /**
   * L'identité HUB2 (`pay_…` + date de création chez HUB2) est la condition de la concordance
   * « Solde HUB2 = Solde App » : sans elle, le rapprochement avec l'export du guichet retombe
   * sur des heuristiques montant + date. Et la fenêtre pour l'obtenir est étroite - une fois le
   * rattrapage joué en production, une colonne ajoutée après coup imposerait un second balayage
   * complet du guichet.
   */
  it('conserve l\'identité HUB2 : `pay_…` et la date de création chez HUB2', async () => {
    const { service, patchEcrit } = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_abc',
      payment_status: PaymentStatus.PENDING,
    });

    enAttente({
      status: 'pending',
      provider: 'wave',
      id: 'pay_01K2ABCDEF',
      createdAt: '2026-08-09T16:30:00.000Z',
    });

    await service.syncHubPaymentByTransactionId('plink_abc');

    const patch = patchEcrit();
    expect(patch.hub_payment_id).toBe('pay_01K2ABCDEF');
    expect(patch.hub_created_at).toEqual(new Date('2026-08-09T16:30:00.000Z'));
  });

  it('ignore une date de création HUB2 illisible plutôt que de la stocker', async () => {
    const { service, patchEcrit } = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_abc',
      payment_status: PaymentStatus.PENDING,
    });

    enAttente({ status: 'pending', provider: 'mtn', createdAt: 'pas-une-date' });

    await service.syncHubPaymentByTransactionId('plink_abc');

    const patch = patchEcrit();
    expect(patch.provider).toBe('mtn');
    expect(patch).not.toHaveProperty('hub_created_at');
  });

  it('🚨 une écriture en échec n\'interrompt PAS la synchronisation', async () => {
    // Ces colonnes servent l'analyse. Laisser leur écriture casser l'appel
    // transformerait un défaut de statistiques en paiement non crédité.
    const execute = jest.fn().mockRejectedValue(new Error('colonne absente'));
    const { service } = makeService(
      {
        uuid: 'pay-uuid',
        transaction_id: 'plink_abc',
        total_amount: 15000,
        payment_status: PaymentStatus.PENDING,
      },
      execute,
    );

    enAttente({ status: 'pending', provider: 'wave' });

    const result = await service.syncHubPaymentByTransactionId('plink_abc');

    expect(execute).toHaveBeenCalled();
    expect(result.status).toBe('pending');
  });

  /**
   * Les deux tests suivants existent pour une raison précise : sans eux, déplacer l'appel de
   * capture dans la seule branche « en attente » laisserait toute la suite VERTE, alors qu'en
   * production plus aucun encaissement ni aucun échec ne serait jamais renseigné.
   */
  it('🚨 capture AUSSI sur un paiement qui aboutit', async () => {
    const { service, patchEcrit } = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_ok',
      total_amount: 15000,
      payment_status: PaymentStatus.PENDING,
    });

    hubService.checkPaymentStatus.mockResolvedValue({
      paid: true,
      payment: {
        status: 'successful',
        provider: 'wave',
        paidAt: '2026-08-09T16:37:30.000Z',
      },
    });

    const result = await service.syncHubPaymentByTransactionId('plink_ok');

    expect(result.status).toBe('paid');
    expect(patchEcrit().provider).toBe('wave');
    expect(patchEcrit().paid_at).toEqual(new Date('2026-08-09T16:37:30.000Z'));
  });

  it('🚨 capture AUSSI sur un paiement qui échoue - c\'est là que vit le motif', async () => {
    const { service, patchEcrit } = makeService({
      uuid: 'pay-uuid',
      transaction_id: 'plink_ko',
      total_amount: 15000,
      payment_status: PaymentStatus.PENDING,
    });

    hubService.checkPaymentStatus.mockResolvedValue({
      paid: false,
      payment: {
        status: 'failed',
        provider: 'orange',
        failureCode: 'authentication_failed',
        failureMessage: 'Code incorrect',
      },
    });

    const result = await service.syncHubPaymentByTransactionId('plink_ko');

    expect(result.status).toBe('failed');
    expect(patchEcrit().provider).toBe('orange');
    expect(patchEcrit().failure_code).toBe('authentication_failed');
  });
});
