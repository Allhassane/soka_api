import { PaymentService } from './payment.service';
import { PaymentEntity, PaymentStatus } from './entities/payment.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { CRON_ABANDON_AFTER_HOURS } from './abandon.constants';

/**
 * RÉGRESSION MESURÉE EN PRODUCTION (2026-08-07) : **585 000 XOF encaissés par le guichet et
 * jamais crédités dans l'application**, sur 38 paiements, avec un taux de perte qui passait
 * de 0 % le 01/08 à 7 sur 9 le 07/08.
 *
 * Mécanique : la synchronisation prenait les `created_at ASC` **plafonnés**. La file comptait
 * 349 paiements en attente pour un plafond de 200, et les 38 encaissements perdus occupaient
 * les rangs 202 à 349 - aucun n'était atteint. Pire, les 200 premiers n'avaient **aucune
 * tentative de paiement** au guichet : HUB2 répond `payment: null` indéfiniment, ils ne
 * pouvaient donc jamais quitter la file et monopolisaient la fenêtre pour toujours.
 *
 * Ces tests verrouillent les deux propriétés qui rendent la panne impossible : **l'ordre**
 * (le récent d'abord) et **la purge** (la file décroît).
 */

function makeService(pending: Partial<PaymentEntity>[]) {
  const queryBuilder: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(pending),
  };

  const paymentRepo = {
    createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    findOne: jest.fn(),
  };

  const service = new PaymentService(
    paymentRepo as never,
    null as never,
    null as never,
    null as never,
    { findOne: jest.fn().mockResolvedValue(null) } as never,
    { findOne: jest.fn().mockResolvedValue(null) } as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
  );

  return { service, queryBuilder };
}

const enAttente = (id: string, ageHeures: number): Partial<PaymentEntity> => ({
  uuid: `pay-${id}`,
  transaction_id: `plink_${id}`,
  payment_status: PaymentStatus.PENDING,
  status: GlobalStatus.PENDING,
  created_at: new Date(Date.now() - ageHeures * 3600_000),
});

describe('PaymentService.syncAllPendingHubPayments - ordre et plafond', () => {
  beforeEach(() => jest.clearAllMocks());

  it('🚨 interroge le plus RÉCENT en premier (sinon la tête de file bloque tout)', async () => {
    const { service, queryBuilder } = makeService([]);

    await service.syncAllPendingHubPayments();

    // C'est LA correction de fond : avec un tri ASC, il suffit que la file dépasse le
    // plafond pour que les paiements récents ne soient plus jamais interrogés.
    expect(queryBuilder.orderBy).toHaveBeenCalledWith('p.created_at', 'DESC');
  });

  it('prend 500 paiements par passage (matelas de sécurité)', async () => {
    const { service, queryBuilder } = makeService([]);

    await service.syncAllPendingHubPayments();

    expect(queryBuilder.take).toHaveBeenCalledWith(500);
  });
});

describe('PaymentService.syncAllPendingHubPayments - purge des abandons', () => {
  beforeEach(() => jest.clearAllMocks());

  it('🚨 referme une tentative vieille SANS aucun paiement engagé (la file décroît)', async () => {
    const vieille = enAttente('vieux', CRON_ABANDON_AFTER_HOURS + 1);
    const { service } = makeService([vieille]);

    jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'pending', transaction_id: 'plink_vieux', hub_payment: null });
    const annule = jest
      .spyOn(service, 'cancelHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'failed', transaction_id: 'plink_vieux', message: 'ok' } as never);

    const result = await service.syncAllPendingHubPayments();

    expect(result.abandoned).toBe(1);
    expect(result.pending).toBe(0);
    // ⚠️ On passe par l'annulation, qui DÉSACTIVE le lien : refermer la seule ligne locale
    // laisserait un lien actif sur lequel un paiement tardif serait perdu en silence.
    expect(annule).toHaveBeenCalledWith('plink_vieux');
  });

  it('🚨 ne referme PAS une tentative que le guichet connaît, même vieille', async () => {
    const vieille = enAttente('connue', CRON_ABANDON_AFTER_HOURS + 100);
    const { service } = makeService([vieille]);

    jest.spyOn(service, 'syncHubPaymentByTransactionId').mockResolvedValue({
      status: 'pending',
      transaction_id: 'plink_connue',
      // Le guichet a une tentative en cours : rien ne permet d'exclure qu'elle aboutisse.
      hub_payment: { status: 'pending', amount: 15000 },
    });
    const annule = jest.spyOn(service, 'cancelHubPaymentByTransactionId');

    const result = await service.syncAllPendingHubPayments();

    expect(result.abandoned).toBe(0);
    expect(result.pending).toBe(1);
    expect(annule).not.toHaveBeenCalled();
  });

  it('ne referme pas une tentative récente sans paiement engagé', async () => {
    const recente = enAttente('recent', 1);
    const { service } = makeService([recente]);

    jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'pending', transaction_id: 'plink_recent', hub_payment: null });
    const annule = jest.spyOn(service, 'cancelHubPaymentByTransactionId');

    const result = await service.syncAllPendingHubPayments();

    expect(result.abandoned).toBe(0);
    expect(result.pending).toBe(1);
    expect(annule).not.toHaveBeenCalled();
  });

  it("un abandon qui s'avère ENCAISSÉ n'est pas compté comme abandon", async () => {
    const vieille = enAttente('paye', CRON_ABANDON_AFTER_HOURS + 5);
    const { service } = makeService([vieille]);

    jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'pending', transaction_id: 'plink_paye', hub_payment: null });
    // La passerelle vérifie avant d'écrire : elle découvre l'encaissement et l'enregistre.
    jest
      .spyOn(service, 'cancelHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'paid', transaction_id: 'plink_paye', message: 'abouti' } as never);

    const result = await service.syncAllPendingHubPayments();

    // C'est ce qui rend la purge sûre en automatique : elle ne peut pas effacer de l'argent.
    expect(result.abandoned).toBe(0);
  });

  it('🚨 un guichet injoignable ne referme rien', async () => {
    const vieille = enAttente('panne', CRON_ABANDON_AFTER_HOURS + 5);
    const { service } = makeService([vieille]);

    jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'pending', transaction_id: 'plink_panne', hub_payment: null });
    jest
      .spyOn(service, 'cancelHubPaymentByTransactionId')
      .mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await service.syncAllPendingHubPayments();

    expect(result.abandoned).toBe(0);
    expect(result.pending).toBe(1);
  });

  it('compte séparément payés, échoués et erreurs', async () => {
    const { service } = makeService([
      enAttente('a', 1),
      enAttente('b', 1),
      enAttente('c', 1),
    ]);

    jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockResolvedValueOnce({ status: 'paid', transaction_id: 'plink_a' })
      .mockResolvedValueOnce({ status: 'failed', transaction_id: 'plink_b' })
      .mockRejectedValueOnce(new Error('boom'));

    const result = await service.syncAllPendingHubPayments();

    expect(result.processed).toBe(3);
    expect(result.paid).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors).toBe(1);
  });
});
