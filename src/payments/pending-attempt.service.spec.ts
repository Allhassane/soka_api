import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  ABANDON_THRESHOLD_MINUTES,
  PendingAttemptService,
} from './pending-attempt.service';

/**
 * SORTIE D'UNE TENTATIVE DE PAIEMENT BLOQUÉE.
 *
 * Les deux modules qui encaissent refusent un nouveau paiement tant qu'une ligne est `init`
 * ou `pending` pour le couple (campagne, bénéficiaire). Ce refus n'avait **aucune sortie** :
 * HUB2 ne referme jamais une tentative abandonnée, et le membre n'a pas le droit de la
 * refermer lui-même. Au 2026-08-07, 151 couples étaient bloqués sans issue.
 *
 * Ces tests verrouillent les décisions qui rendent la sortie sûre. Chacun protège contre un
 * mode de panne coûteux : rendre un membre définitivement bloqué, ou le faire payer deux fois.
 */

const minutesAgo = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000);

interface Fixture {
  lines?: any[];
  payments?: any[];
  sync?: jest.Mock;
  cancel?: jest.Mock;
}

function makeService({ lines = [], payments = [], sync, cancel }: Fixture) {
  const subscriptionRepo = {
    find: jest.fn().mockResolvedValue(lines),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const donateRepo = {
    find: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue(undefined),
  };
  const paymentRepo = { find: jest.fn().mockResolvedValue(payments) };
  const paymentService: Record<string, jest.Mock> = {
    syncHubPaymentByTransactionId: sync ?? jest.fn(),
    cancelHubPaymentByTransactionId: cancel ?? jest.fn(),
    closeUnknownPaymentLink: jest.fn().mockResolvedValue(undefined),
  };

  const service = new PendingAttemptService(
    subscriptionRepo as never,
    donateRepo as never,
    paymentRepo as never,
    paymentService as never,
  );

  return { service, subscriptionRepo, paymentRepo, paymentService };
}

/** Une ligne bloquante et le paiement qui la porte, cohérents entre eux. */
function attempt(id: string, ageMinutes: number) {
  return {
    line: {
      uuid: `line-${id}`,
      payment_uuid: `pay-${id}`,
      amount: 1000,
      quantity: 1,
      actor_uuid: 'member-1',
      actor_name: 'AWA KONE',
      created_at: minutesAgo(ageMinutes),
    },
    payment: { uuid: `pay-${id}`, transaction_id: `plink_${id}` },
  };
}

describe('PendingAttemptService.review', () => {
  beforeEach(() => jest.clearAllMocks());

  it("sans ligne bloquante, n'interroge PAS le guichet (chemin rapide du paiement)", async () => {
    const sync = jest.fn();
    const { service, paymentRepo } = makeService({ lines: [], sync });

    const review = await service.review('subscription', 'camp-1', 'benef-1');

    expect(review.open).toHaveLength(0);
    expect(review.stale).toBe(false);
    // La revue est sur le chemin de l'initiation : le cas nominal (personne n'est bloqué)
    // ne doit coûter ni appel réseau, ni même une requête de plus.
    expect(sync).not.toHaveBeenCalled();
    expect(paymentRepo.find).not.toHaveBeenCalled();
  });

  it('une tentative que le guichet déclare échouée cesse de bloquer', async () => {
    const a = attempt('a', 4000);
    const sync = jest.fn().mockResolvedValue({ status: 'failed' });
    const { service } = makeService({
      lines: [a.line],
      payments: [a.payment],
      sync,
    });

    const review = await service.review('subscription', 'camp-1', 'benef-1');

    expect(review.open).toHaveLength(0);
    expect(review.closed).toBe(1);
    expect(review.stale).toBe(false);
  });

  it('une tentative en réalité ENCAISSÉE est comptée à part, jamais comme ouverte', async () => {
    const a = attempt('a', 4000);
    const sync = jest.fn().mockResolvedValue({ status: 'paid' });
    const { service } = makeService({
      lines: [a.line],
      payments: [a.payment],
      sync,
    });

    const review = await service.review('subscription', 'camp-1', 'benef-1');

    // C'est ce compteur qui fait renoncer l'appelant au nouveau paiement : la
    // notification s'était perdue, le membre a déjà payé.
    expect(review.settled_paid).toBe(1);
    expect(review.open).toHaveLength(0);
  });

  it('🚨 un guichet injoignable NE referme PAS la tentative', async () => {
    const a = attempt('a', 4000);
    const sync = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const { service } = makeService({
      lines: [a.line],
      payments: [a.payment],
      sync,
    });

    const review = await service.review('subscription', 'camp-1', 'benef-1');

    // Conclure à l'échec sur une panne réseau autoriserait un second paiement pendant
    // qu'un premier est peut-être en train d'aboutir. C'est le double débit.
    expect(review.open).toHaveLength(1);
    expect(review.closed).toBe(0);
  });

  it("une ligne SANS paiement rattaché bloque toujours, sans être dite vérifiée", async () => {
    const orpheline = attempt('orph', 4000);
    const sync = jest.fn();
    const { service } = makeService({
      lines: [orpheline.line],
      payments: [], // le paiement lié n'existe pas
      sync,
    });

    const review = await service.review('subscription', 'camp-1', 'benef-1');

    // Anomalie de données : on ne l'écrase pas en silence (ce serait effacer la seule
    // trace du problème), mais le membre garde sa sortie par l'annulation explicite.
    expect(review.open).toHaveLength(1);
    expect(review.open[0].verified).toBe(false);
    expect(sync).not.toHaveBeenCalled();
  });

  it(`une tentative de moins de ${ABANDON_THRESHOLD_MINUTES} min n'est PAS annulable`, async () => {
    const a = attempt('a', 3);
    const sync = jest.fn().mockResolvedValue({ status: 'pending' });
    const { service } = makeService({
      lines: [a.line],
      payments: [a.payment],
      sync,
    });

    const review = await service.review('subscription', 'camp-1', 'benef-1');

    expect(review.open).toHaveLength(1);
    // Le payeur est peut-être en train de saisir son code chez son opérateur : lui
    // proposer d'annuler l'enverrait payer deux fois.
    expect(review.stale).toBe(false);
  });

  it(`au-delà de ${ABANDON_THRESHOLD_MINUTES} min, la tentative devient annulable`, async () => {
    const a = attempt('a', ABANDON_THRESHOLD_MINUTES + 1);
    const sync = jest.fn().mockResolvedValue({ status: 'pending' });
    const { service } = makeService({
      lines: [a.line],
      payments: [a.payment],
      sync,
    });

    const review = await service.review('subscription', 'camp-1', 'benef-1');

    expect(review.stale).toBe(true);
    expect(review.oldest_age_minutes).toBeGreaterThanOrEqual(
      ABANDON_THRESHOLD_MINUTES,
    );
  });

  it("l'ancienneté retenue est celle de la PLUS ANCIENNE tentative ouverte", async () => {
    const recent = attempt('recent', 2);
    const old = attempt('old', 5000);
    const sync = jest.fn().mockResolvedValue({ status: 'pending' });
    const { service } = makeService({
      lines: [recent.line, old.line],
      payments: [recent.payment, old.payment],
      sync,
    });

    const review = await service.review('subscription', 'camp-1', 'benef-1');

    expect(review.open).toHaveLength(2);
    expect(review.oldest_age_minutes).toBeGreaterThanOrEqual(5000);
    // Une seule tentative ancienne suffit à ouvrir la porte : sinon un membre qui vient
    // de recliquer resterait bloqué par ses tentatives d'il y a une semaine.
    expect(review.stale).toBe(true);
  });
});

describe('PendingAttemptService.cancelAll', () => {
  beforeEach(() => jest.clearAllMocks());

  it('🚨 referme TOUTES les tentatives, pas seulement la plus ancienne', async () => {
    const a = attempt('a', 4000);
    const b = attempt('b', 3000);
    const c = attempt('c', 2000);
    const cancel = jest.fn().mockResolvedValue({ status: 'failed' });
    const { service } = makeService({
      lines: [a.line, b.line, c.line],
      payments: [a.payment, b.payment, c.payment],
      cancel,
    });

    const outcome = await service.cancelAll('subscription', 'camp-1', 'benef-1');

    // 73 des 151 bénéficiaires bloqués portaient PLUSIEURS lignes (jusqu'à 39) :
    // n'en refermer qu'une les laisserait bloqués par la suivante.
    expect(cancel).toHaveBeenCalledTimes(3);
    expect(outcome.canceled).toBe(3);
    expect(outcome.paid).toBe(0);
    expect(outcome.failed).toBe(0);
  });

  it("une tentative qui a en réalité abouti est comptée 'paid', jamais 'canceled'", async () => {
    const a = attempt('a', 4000);
    const cancel = jest.fn().mockResolvedValue({ status: 'paid' });
    const { service } = makeService({
      lines: [a.line],
      payments: [a.payment],
      cancel,
    });

    const outcome = await service.cancelAll('subscription', 'camp-1', 'benef-1');

    expect(outcome.paid).toBe(1);
    expect(outcome.canceled).toBe(0);
  });

  it('un paiement déjà encaissé localement (409) est un paiement, pas un échec', async () => {
    const a = attempt('a', 4000);
    const cancel = jest
      .fn()
      .mockRejectedValue(new ConflictException('Ce paiement a abouti'));
    const { service } = makeService({
      lines: [a.line],
      payments: [a.payment],
      cancel,
    });

    const outcome = await service.cancelAll('subscription', 'camp-1', 'benef-1');

    expect(outcome.paid).toBe(1);
    expect(outcome.failed).toBe(0);
  });

  it('un lien inconnu du guichet (404) referme la ligne ET le paiement', async () => {
    const a = attempt('a', 4000);
    const cancel = jest
      .fn()
      .mockRejectedValue(new NotFoundException('Lien introuvable'));
    const { service, paymentService } = makeService({
      lines: [a.line],
      payments: [a.payment],
      cancel,
    });
    paymentService.closeUnknownPaymentLink = jest.fn().mockResolvedValue(undefined);

    const outcome = await service.cancelAll('subscription', 'camp-1', 'benef-1');

    // Aucun encaissement ne peut plus venir d'un lien que le guichet ne connaît pas ;
    // laisser la ligne ouverte bloquerait le membre pour toujours.
    expect(outcome.canceled).toBe(1);
    // ⚠️ Le PAIEMENT aussi : ne fermer que la ligne laissait le cron interroger ce lien à
    // chaque passage et la console d'assistance afficher un ticket déjà résolu.
    expect(paymentService.closeUnknownPaymentLink).toHaveBeenCalledWith(a.payment);
  });

  it("🚨 une panne du guichet marque la revue 'partielle' et la tentative NON vérifiée", async () => {
    const a = attempt('a', 4000);
    const sync = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const { service } = makeService({
      lines: [a.line],
      payments: [a.payment],
      sync,
    });

    const review = await service.review('subscription', 'camp-1', 'benef-1');

    // Annoncer « vérifié » sur une tentative dont on ne sait rien priverait l'écran de son
    // avertissement, et laisserait croire au membre que l'état affiché est certain.
    expect(review.open[0].verified).toBe(false);
    expect(review.partial).toBe(true);
  });

  it("une panne du guichet est un ÉCHEC d'annulation, pas une fermeture silencieuse", async () => {
    const a = attempt('a', 4000);
    const cancel = jest.fn().mockRejectedValue(new Error('timeout'));
    const { service, subscriptionRepo } = makeService({
      lines: [a.line],
      payments: [a.payment],
      cancel,
    });

    const outcome = await service.cancelAll('subscription', 'camp-1', 'benef-1');

    expect(outcome.failed).toBe(1);
    expect(outcome.canceled).toBe(0);
    // La tentative reste encaissable : ne rien écrire localement est le seul choix sûr.
    expect(subscriptionRepo.update).not.toHaveBeenCalled();
  });
});

describe('PendingAttemptService - forme du refus opposé au membre', () => {
  beforeEach(() => jest.clearAllMocks());

  it('🚨 le détail voyage dans `data` : seule clé que le filtre global laisse passer', async () => {
    const a = attempt('a', ABANDON_THRESHOLD_MINUTES + 5);
    const sync = jest.fn().mockResolvedValue({ status: 'pending' });
    const { service } = makeService({
      lines: [a.line],
      payments: [a.payment],
      sync,
    });

    const review = await service.review('subscription', 'camp-1', 'benef-1');
    const refus = service.conflictFor(review, 'AWA KONE');
    const body = refus.getResponse() as any;

    expect(refus.getStatus()).toBe(409);
    // Le web reconnaît le refus à son CODE, jamais à son message.
    expect(body.data.code).toBe('PENDING_ATTEMPT');
    expect(body.data.can_cancel).toBe(true);
    expect(body.data.attempts).toHaveLength(1);
    expect(body.message).toContain('AWA KONE');
  });

  it("une tentative trop récente refuse SANS proposer l'annulation", async () => {
    const a = attempt('a', 2);
    const sync = jest.fn().mockResolvedValue({ status: 'pending' });
    const { service } = makeService({
      lines: [a.line],
      payments: [a.payment],
      sync,
    });

    const review = await service.review('subscription', 'camp-1', 'benef-1');
    const body = service.conflictFor(review, 'AWA KONE').getResponse() as any;

    expect(body.data.can_cancel).toBe(false);
    // L'écran doit pouvoir dire quand réessayer, sinon le refus est un mur.
    expect(body.data.retry_after_minutes).toBeGreaterThan(0);
  });
});
