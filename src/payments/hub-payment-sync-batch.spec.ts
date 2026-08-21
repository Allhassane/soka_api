import { PaymentService } from './payment.service';
import { HubPaymentSyncCronService } from './hub-payment-sync.cron';
import { PaymentEntity, PaymentStatus } from './entities/payment.entity';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { CRON_ABANDON_AFTER_HOURS } from './abandon.constants';

describe('HubPaymentSyncCronService - interrupteur de poste de test', () => {
  it('🚨 HUB_SYNC_CRON_ENABLED=false désarme le cron - indispensable pour brancher une API locale sur le guichet de PRODUCTION sans rien pouvoir y écrire', async () => {
    process.env.HUB_SYNC_CRON_ENABLED = 'false';
    try {
      const paymentService = { syncAllPendingHubPayments: jest.fn() };
      const cron = new HubPaymentSyncCronService(paymentService as never);

      await cron.syncPendingHubPayments();

      expect(paymentService.syncAllPendingHubPayments).not.toHaveBeenCalled();
    } finally {
      delete process.env.HUB_SYNC_CRON_ENABLED;
    }
  });

  it('reste armé par défaut (variable absente)', async () => {
    delete process.env.HUB_SYNC_CRON_ENABLED;
    const paymentService = {
      syncAllPendingHubPayments: jest.fn().mockResolvedValue({
        processed: 0, paid: 0, failed: 0, abandoned: 0, pending: 0, errors: 0,
        recredited: 0,
      }),
    };
    const cron = new HubPaymentSyncCronService(paymentService as never);

    await cron.syncPendingHubPayments();

    expect(paymentService.syncAllPendingHubPayments).toHaveBeenCalledTimes(1);
  });
});

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

/**
 * Deux files, donc deux `createQueryBuilder` : la 1ʳᵉ rend les `pending`, la 2ᵈᵉ les
 * tentatives closes à re-vérifier. Les confondre ferait passer la même liste deux fois.
 */
function makeService(
  pending: Partial<PaymentEntity>[],
  closed: Partial<PaymentEntity>[] = [],
) {
  const build = (rows: Partial<PaymentEntity>[]) => ({
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(rows),
  });

  const queryBuilder: any = build(pending);
  const closedBuilder: any = build(closed);

  const paymentRepo = {
    createQueryBuilder: jest
      .fn()
      .mockReturnValueOnce(queryBuilder)
      .mockReturnValueOnce(closedBuilder),
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

  return { service, queryBuilder, closedBuilder, paymentRepo };
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

  it('la file des `pending` et celle des closes sont DEUX requêtes distinctes', async () => {
    const { service, paymentRepo } = makeService([], []);

    await service.syncAllPendingHubPayments();

    // 🚨 Fondues en une seule, les lignes closes (jusqu'à 350 en un jour) mangeraient le
    // plafond de 500 au détriment des `pending` - l'argent en cours.
    expect(paymentRepo.createQueryBuilder).toHaveBeenCalledTimes(2);
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

/**
 * RÉGRESSION MESURÉE EN PRODUCTION (2026-08-20) : **30 000 XOF encaissés et jamais crédités**,
 * sur 2 paiements des 17 et 18/08.
 *
 * Mécanique : le membre rate sa validation, le guichet répond `failed`, le cron referme la
 * ligne - **puis le membre recommence sur le MÊME lien et réussit** (47 min plus tard dans un
 * cas, 9 min dans l'autre). Un lien HUB2 n'expire pas et reste payable après un échec ; côté
 * application, en revanche, `failed` sortait la ligne de la file **pour toujours**, et
 * `syncHubPaymentByTransactionId` répondait depuis la base sans jamais rappeler le guichet.
 *
 * Ces tests verrouillent la propriété qui rend la panne impossible : **une tentative close
 * reste vérifiée tant qu'elle est dans la fenêtre**, et un encaissement retrouvé se VOIT.
 */
describe('PaymentService.syncAllPendingHubPayments - re-vérification des tentatives closes', () => {
  beforeEach(() => jest.clearAllMocks());

  const close = (
    id: string,
    statut: PaymentStatus = PaymentStatus.FAILED,
  ): Partial<PaymentEntity> => ({
    uuid: `pay-${id}`,
    transaction_id: `plink_${id}`,
    payment_status: statut,
    status: GlobalStatus.FAILED,
    total_amount: 15000,
    beneficiary_name: 'MEMBRE TEST',
    created_at: new Date(),
  });

  it('🚨 rattrape un paiement REFERMÉ À TORT que le guichet a encaissé', async () => {
    const { service } = makeService([], [close('rattrape')]);

    const sync = jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'paid', transaction_id: 'plink_rattrape' });

    const result = await service.syncAllPendingHubPayments();

    // Compté à part de `paid` : noyé dedans, il redeviendrait invisible dans le journal.
    expect(result.recredited).toBe(1);
    expect(result.paid).toBe(0);
    // ⚠️ C'est le drapeau qui fait tout : sans lui, la synchronisation répond « échoué »
    // depuis la base sans jamais rappeler le guichet, et l'argent reste perdu.
    expect(sync).toHaveBeenCalledWith('plink_rattrape', { relancerCloture: true });
  });

  it('re-vérifie aussi les tentatives ANNULÉES par le membre', async () => {
    // Le lien est désactivé à l'annulation, mais une autorisation déjà validée chez
    // l'opérateur ira à son terme - et aucun webhook n'existe pour la ramener.
    const { service } = makeService([], [close('annule', PaymentStatus.CANCELLED)]);

    jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'paid', transaction_id: 'plink_annule' });

    const result = await service.syncAllPendingHubPayments();

    expect(result.recredited).toBe(1);
  });

  it('une tentative close qui reste échouée ne compte pas comme rattrapage', async () => {
    const { service } = makeService([], [close('toujours-echoue')]);

    jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'failed', transaction_id: 'plink_toujours-echoue' });

    const result = await service.syncAllPendingHubPayments();

    expect(result.recredited).toBe(0);
    expect(result.failed).toBe(1);
  });

  it('🚨 un guichet injoignable ne fait pas passer un rattrapage pour un échec', async () => {
    const { service } = makeService([], [close('panne')]);

    jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await service.syncAllPendingHubPayments();

    expect(result.errors).toBe(1);
    expect(result.recredited).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("borne la file des closes à son propre plafond, pas à celui des `pending`", async () => {
    const { service, closedBuilder } = makeService([], []);

    await service.syncAllPendingHubPayments();

    expect(closedBuilder.take).toHaveBeenCalledWith(300);
    // Et elle part de la plus récemment refermée : même raison qu'ailleurs, une exécution
    // écourtée doit avoir traité ce qui compte le plus.
    expect(closedBuilder.orderBy).toHaveBeenCalledWith('p.updated_at', 'DESC');
  });

  it('les deux files sont traitées dans le même passage', async () => {
    const { service } = makeService(
      [{ uuid: 'p1', transaction_id: 'plink_p1', payment_status: PaymentStatus.PENDING, created_at: new Date() }],
      [close('c1')],
    );

    jest
      .spyOn(service, 'syncHubPaymentByTransactionId')
      .mockResolvedValue({ status: 'paid', transaction_id: 'x' });

    const result = await service.syncAllPendingHubPayments();

    expect(result.processed).toBe(2);
    expect(result.paid).toBe(1);
    expect(result.recredited).toBe(1);
  });
});
