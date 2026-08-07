import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { PaymentEntity, PaymentStatus } from './entities/payment.entity';
import { PaymentService } from './payment.service';
import { GlobalStatus } from 'src/shared/enums/global-status.enum';
import { DonatePaymentEntity } from 'src/donate-payment/entities/donate-payment.entity';
import { SubscriptionPaymentEntity } from 'src/subscription-payment/entities/subscription-payment.entity';

/**
 * ⏱️ **Au-delà de ce délai, une tentative encore ouverte est un ABANDON.**
 *
 * Ce seuil existe parce que le guichet ne dira jamais l'abandon lui-même : HUB2 ne bascule
 * pas une intention refusée ou délaissée en `failed`, il la **remet en attente**. Une
 * tentative que le payeur a quittée reste donc « en cours » pour l'éternité, et aucune
 * synchronisation, si fréquente soit-elle, ne pourra la refermer. C'est le temps écoulé -
 * et lui seul - qui permet de trancher.
 *
 * 15 minutes : au-delà, plus personne n'est devant l'écran de son opérateur ; en deçà, le
 * payeur est peut-être en train de saisir son code, et lui proposer d'annuler l'enverrait
 * payer deux fois.
 */
export const ABANDON_THRESHOLD_MINUTES = 15;

/** Nombre d'interrogations du guichet menées de front pendant une revue. */
const VERIFY_CONCURRENCY = 5;

/**
 * Budget de temps total d'une revue. La revue s'exécute **sur le chemin de l'initiation
 * d'un paiement** : au-delà, on cesse d'interroger le guichet et on considère les
 * tentatives restantes comme ouvertes. C'est le repli prudent - il fait poser la question
 * au membre plutôt que de le laisser payer une deuxième fois.
 */
const VERIFY_BUDGET_MS = 6000;

export type AttemptKind = 'subscription' | 'donate';

/** Une tentative de paiement que le guichet n'a pas tranchée. */
export interface OpenAttempt {
  /** uuid de la ligne d'abonnement / de zaimu. */
  line_uuid: string;
  payment_uuid: string;
  transaction_id: string | null;
  amount: number;
  quantity: number;
  /** Qui a engagé la tentative - peut ne pas être le bénéficiaire. */
  actor_name: string | null;
  actor_uuid: string | null;
  created_at: Date;
  age_minutes: number;
  /**
   * `false` quand le budget de temps a été épuisé avant d'avoir pu interroger le guichet
   * pour cette tentative : elle est comptée comme ouverte sans que ce soit prouvé.
   */
  verified: boolean;
}

export interface PendingAttemptReview {
  /** Tentatives réellement encore ouvertes, la plus ancienne en tête. */
  open: OpenAttempt[];
  /** Lignes refermées par la revue (le guichet a tranché : échec ou annulation). */
  closed: number;
  /** Lignes que la revue a trouvées **encaissées** : le membre a déjà payé. */
  settled_paid: number;
  /** Vrai si le budget de temps a empêché de vérifier toutes les tentatives. */
  partial: boolean;
  /** Ancienneté de la plus ancienne tentative ouverte, en minutes. */
  oldest_age_minutes: number | null;
  /** Au moins une tentative ouverte dépasse le seuil d'abandon : elle est annulable. */
  stale: boolean;
}

/** Photographie sans appel au guichet, pour les écrans qui préviennent avant le clic. */
export interface PendingAttemptSnapshot {
  count: number;
  oldest_created_at: Date | null;
  oldest_age_minutes: number | null;
  stale: boolean;
}

export interface CancelAttemptsOutcome {
  canceled: number;
  /**
   * Tentatives que le guichet a déclarées **encaissées** au moment de les annuler : rien
   * n'a été fermé, le paiement a été enregistré. Le membre ne doit surtout pas repayer.
   */
  paid: number;
  /** Tentatives qu'on n'a pas réussi à refermer (guichet injoignable). */
  failed: number;
}

/**
 * **Le point unique de traitement des tentatives de paiement restées « en cours ».**
 *
 * Les deux modules qui encaissent (abonnements, zaimu) refusent d'engager un nouveau
 * paiement tant qu'une ligne du couple (campagne, bénéficiaire) est `init` ou `pending`.
 * Ce refus est nécessaire - sans lui, un membre qui rafraîchit sa page enchaîne les liens
 * de paiement et peut être débité plusieurs fois - mais il n'avait **aucune sortie** :
 *
 * - HUB2 ne referme jamais une tentative abandonnée (cf. `ABANDON_THRESHOLD_MINUTES`) ;
 * - le membre n'a ni bouton ni droit pour la refermer (`paiements_modifier` ne lui est pas
 *   accordé, et le lui donner ouvrirait la modification de **n'importe quel** paiement) ;
 * - la ligne métier peut par ailleurs **mentir** : 23 lignes de la base sont restées
 *   `pending` alors que leur paiement est `fail`.
 *
 * Résultat mesuré au 2026-08-07 : **477 lignes bloquantes**, **151 couples (campagne,
 * bénéficiaire)** empêchés de payer, dont **83 n'avaient jamais réussi un paiement** sur la
 * campagne concernée.
 *
 * Ce service ne décide de rien tout seul : il **constate** (`review`) puis **exécute ce que
 * le membre a choisi** (`cancelAll`). Les décisions d'affichage et de refus restent dans
 * les services métier.
 */
@Injectable()
export class PendingAttemptService {
  private readonly logger = new Logger(PendingAttemptService.name);

  constructor(
    @InjectRepository(SubscriptionPaymentEntity)
    private readonly subscriptionPaymentRepo: Repository<SubscriptionPaymentEntity>,

    @InjectRepository(DonatePaymentEntity)
    private readonly donatePaymentRepo: Repository<DonatePaymentEntity>,

    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,

    private readonly paymentService: PaymentService,
  ) {}

  // ============================================================
  // LECTURE SEULE - aucun appel au guichet
  // ============================================================

  /**
   * État des tentatives en cours **d'après la base seule**.
   *
   * ⚠️ Volontairement sans appel au guichet : cette méthode sert les routes `quota`,
   * appelées **au chargement de l'écran**. Y brancher le guichet ferait partir un appel
   * réseau par affichage de page pour tout membre bloqué. La vérification, elle, a lieu au
   * moment du clic - là où elle change quelque chose.
   */
  async snapshot(
    kind: AttemptKind,
    campaignUuid: string,
    beneficiaryUuid: string,
  ): Promise<PendingAttemptSnapshot> {
    const lines = await this.findBlockingLines(
      kind,
      campaignUuid,
      beneficiaryUuid,
    );

    if (!lines.length) {
      return {
        count: 0,
        oldest_created_at: null,
        oldest_age_minutes: null,
        stale: false,
      };
    }

    const oldest = lines[0];
    const age = this.ageInMinutes(oldest.created_at);

    return {
      count: lines.length,
      oldest_created_at: oldest.created_at,
      oldest_age_minutes: age,
      stale: age >= ABANDON_THRESHOLD_MINUTES,
    };
  }

  // ============================================================
  // REVUE - interroge le guichet et referme ce qui peut l'être
  // ============================================================

  /**
   * Passe en revue les tentatives bloquantes d'un couple (campagne, bénéficiaire) et rend
   * celles qui sont **réellement** encore ouvertes.
   *
   * Chaque tentative passe par `syncHubPaymentByTransactionId`, qui répond depuis la base
   * quand le statut y est déjà définitif (aucun appel réseau inutile), interroge le guichet
   * sinon, et **répare la ligne métier** dans les deux cas. Une tentative encaissée dont la
   * notification s'était perdue est donc créditée ici, au passage.
   *
   * ⚠️ Les erreurs ne referment RIEN : un guichet injoignable laisse la tentative ouverte.
   * L'inverse - considérer qu'une tentative invérifiable est morte - autoriserait un second
   * paiement pendant qu'un premier est peut-être en train d'aboutir.
   */
  async review(
    kind: AttemptKind,
    campaignUuid: string,
    beneficiaryUuid: string,
  ): Promise<PendingAttemptReview> {
    const lines = await this.findBlockingLines(
      kind,
      campaignUuid,
      beneficiaryUuid,
    );

    if (!lines.length) {
      return this.emptyReview();
    }

    const payments = await this.loadPayments(lines);
    const startedAt = Date.now();

    const open: OpenAttempt[] = [];
    let closed = 0;
    let settledPaid = 0;
    let partial = false;

    for (let i = 0; i < lines.length; i += VERIFY_CONCURRENCY) {
      const lot = lines.slice(i, i + VERIFY_CONCURRENCY);

      // Budget épuisé : le reste est déclaré ouvert SANS avoir été vérifié.
      if (Date.now() - startedAt > VERIFY_BUDGET_MS) {
        partial = true;
        for (const line of lot) {
          open.push(this.toOpenAttempt(line, payments.get(line.payment_uuid), false));
        }
        continue;
      }

      const verdicts = await Promise.all(
        lot.map((line) => this.verifyOne(line, payments.get(line.payment_uuid))),
      );

      for (let j = 0; j < lot.length; j += 1) {
        const verdict = verdicts[j];
        if (verdict === 'paid') settledPaid += 1;
        else if (verdict === 'closed') closed += 1;
        else {
          // ⚠️ `unknown` ≠ `open` : dans les deux cas la tentative bloque encore, mais
          // « le guichet a répondu qu'elle est en cours » et « le guichet n'a pas répondu »
          // ne se valent pas. Les confondre afficherait « vérifié » sur une tentative dont
          // on ne sait rien - et priverait l'écran de son avertissement.
          if (verdict === 'unknown') partial = true;
          open.push(
            this.toOpenAttempt(
              lot[j],
              payments.get(lot[j].payment_uuid),
              verdict === 'open',
            ),
          );
        }
      }
    }

    if (partial) {
      this.logger.warn(
        `Revue partielle (${kind}) : budget de ${VERIFY_BUDGET_MS} ms épuisé sur `
        + `${lines.length} tentative(s) - certaines sont déclarées ouvertes sans vérification.`,
      );
    }

    open.sort((a, b) => a.created_at.getTime() - b.created_at.getTime());
    const oldest = open.length ? open[0].age_minutes : null;

    return {
      open,
      closed,
      settled_paid: settledPaid,
      partial,
      oldest_age_minutes: oldest,
      stale: oldest !== null && oldest >= ABANDON_THRESHOLD_MINUTES,
    };
  }

  // ============================================================
  // ANNULATION - referme tout, sur demande explicite du membre
  // ============================================================

  /**
   * Referme **toutes** les tentatives encore ouvertes du couple (campagne, bénéficiaire).
   *
   * ⚠️ **Toutes, pas la plus ancienne.** 73 des 151 bénéficiaires bloqués portaient
   * plusieurs lignes (jusqu'à 39 pour un seul) : n'en refermer qu'une les laisserait
   * bloqués par la suivante, et le membre relancerait la même demande en boucle.
   *
   * ⚠️ **L'annulation ne débite ni ne rembourse rien** : elle demande à la passerelle de
   * fermer ses portes (lien désactivé, sessions et intentions annulées). Si la passerelle
   * découvre au passage que la tentative a **abouti**, elle n'annule rien et le paiement est
   * enregistré - c'est le compteur `paid` du retour, et l'appelant doit alors renoncer à
   * engager un nouveau paiement.
   */
  async cancelAll(
    kind: AttemptKind,
    campaignUuid: string,
    beneficiaryUuid: string,
  ): Promise<CancelAttemptsOutcome> {
    const lines = await this.findBlockingLines(
      kind,
      campaignUuid,
      beneficiaryUuid,
    );

    const outcome: CancelAttemptsOutcome = { canceled: 0, paid: 0, failed: 0 };
    if (!lines.length) return outcome;

    const payments = await this.loadPayments(lines);

    for (let i = 0; i < lines.length; i += VERIFY_CONCURRENCY) {
      const lot = lines.slice(i, i + VERIFY_CONCURRENCY);

      const results = await Promise.all(
        lot.map((line) => this.cancelOne(kind, line, payments.get(line.payment_uuid))),
      );

      for (const result of results) outcome[result] += 1;
    }

    return outcome;
  }

  // ============================================================
  // REFUS - une seule formulation pour les deux modules
  // ============================================================

  /**
   * Le refus opposé au membre quand des tentatives restent ouvertes.
   *
   * ⚠️ **409 et non 400.** Un 400 dit « votre demande est mal formée » et n'appelle aucune
   * suite ; un 409 dit « l'état actuel s'y oppose », ce qui est exactement le cas et ce qui
   * permet à l'écran de distinguer ce refus-là de tous les autres pour ouvrir sa fenêtre.
   * Avant, ce refus était un 400 parmi d'autres, affiché en bandeau rouge sans issue.
   *
   * ⚠️ Le détail voyage dans **`data`** : c'est la seule clé que le filtre d'erreurs global
   * laisse passer (cf. `shared/interceptors/error.interceptor.ts`). Un champ posé ailleurs
   * dans l'exception n'atteindrait jamais le navigateur.
   */
  conflictFor(review: PendingAttemptReview, beneficiaryLabel: string) {
    const age = this.describeAge(review.oldest_age_minutes ?? 0);
    const plural = review.open.length > 1;

    const message = review.stale
      ? `${plural ? `${review.open.length} paiements sont déjà engagés` : 'Un paiement est déjà engagé'}`
        + ` pour ${beneficiaryLabel} sur cette campagne, depuis ${age}.`
        + ` Vous pouvez ${plural ? 'les' : 'l\''}annuler pour recommencer.`
      : `Un paiement vient d'être engagé pour ${beneficiaryLabel} (il y a ${age}).`
        + ` Terminez-le sur votre téléphone, ou patientez `
        + `${this.describeAge(this.minutesBeforeCancellable(review))} avant de recommencer.`;

    return new ConflictException({
      message,
      data: {
        code: 'PENDING_ATTEMPT',
        /** L'écran n'ouvre sa fenêtre d'annulation que sur cette valeur. */
        can_cancel: review.stale,
        count: review.open.length,
        oldest_age_minutes: review.oldest_age_minutes,
        retry_after_minutes: review.stale
          ? 0
          : this.minutesBeforeCancellable(review),
        threshold_minutes: ABANDON_THRESHOLD_MINUTES,
        /** Vrai quand toutes les tentatives n'ont pas pu être vérifiées (guichet lent). */
        partial: review.partial,
        settled_paid: review.settled_paid,
        closed: review.closed,
        attempts: review.open.map((a) => ({
          transaction_id: a.transaction_id,
          amount: a.amount,
          quantity: a.quantity,
          actor_name: a.actor_name,
          created_at: a.created_at,
          age_minutes: a.age_minutes,
          verified: a.verified,
        })),
      },
    });
  }

  /**
   * Refus quand la revue (ou l'annulation) découvre que le paiement a en réalité **abouti**.
   *
   * ⚠️ On ne laisse **jamais** le nouveau paiement partir dans ce cas : le membre a cliqué
   * « payer » en croyant que rien n'était passé. L'encaisser une seconde fois sans un mot
   * serait un double débit provoqué par notre propre notification perdue.
   */
  conflictAlreadyPaid(count: number) {
    return new ConflictException({
      message:
        count > 1
          ? `${count} de vos paiements en attente ont en réalité abouti : ils viennent d'être enregistrés. Vérifiez vos souscriptions avant d'en engager un nouveau.`
          : `Votre paiement en attente a en réalité abouti : il vient d'être enregistré. Vérifiez vos souscriptions avant d'en engager un nouveau.`,
      data: { code: 'ALREADY_PAID', count },
    });
  }

  /** Refus quand la passerelle n'a pas pu refermer toutes les tentatives. */
  conflictCancelFailed(count: number) {
    return new ConflictException({
      message:
        `${count} tentative(s) n'ont pas pu être refermées : le guichet de paiement n'a pas répondu.`
        + ` Réessayez dans un instant - rien n'a été débité.`,
      data: { code: 'CANCEL_FAILED', count },
    });
  }

  /** Minutes restantes avant qu'une tentative devienne annulable. */
  private minutesBeforeCancellable(review: PendingAttemptReview): number {
    return Math.max(
      1,
      ABANDON_THRESHOLD_MINUTES - (review.oldest_age_minutes ?? 0),
    );
  }

  /** Ancienneté en clair. Le membre raisonne en minutes, en heures ou en jours. */
  private describeAge(minutes: number): string {
    if (minutes < 1) return "moins d'une minute";
    if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;

    const hours = Math.floor(minutes / 60);
    if (hours < 48) return `${hours} heure${hours > 1 ? 's' : ''}`;

    const days = Math.floor(hours / 24);
    return `${days} jour${days > 1 ? 's' : ''}`;
  }

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Lignes qui font barrage, les plus anciennes en tête.
   *
   * ⚠️ Exactement le même filtre que celui appliqué à l'initiation : `status IN
   * ('init','pending')` sur le couple (campagne, bénéficiaire). Si les deux venaient à
   * diverger, on refuserait un paiement pour une tentative que la revue ne verrait même pas
   * - et le membre serait bloqué avec un écran qui lui dirait que tout va bien.
   */
  private async findBlockingLines(
    kind: AttemptKind,
    campaignUuid: string,
    beneficiaryUuid: string,
  ): Promise<BlockingLine[]> {
    const blocking = In([GlobalStatus.INIT, GlobalStatus.PENDING]);
    const order = { created_at: 'ASC' as const };

    if (kind === 'subscription') {
      const rows = await this.subscriptionPaymentRepo.find({
        where: {
          subscription_uuid: campaignUuid,
          beneficiary_uuid: beneficiaryUuid,
          status: blocking,
        },
        order,
      });
      return rows.map((r) => this.toBlockingLine(r));
    }

    const rows = await this.donatePaymentRepo.find({
      where: {
        donate_uuid: campaignUuid,
        beneficiary_uuid: beneficiaryUuid,
        status: blocking,
      },
      order,
    });
    return rows.map((r) => this.toBlockingLine(r));
  }

  private toBlockingLine(
    row: SubscriptionPaymentEntity | DonatePaymentEntity,
  ): BlockingLine {
    return {
      line_uuid: row.uuid,
      payment_uuid: row.payment_uuid,
      amount: Number(row.amount ?? 0),
      quantity: Number((row as { quantity?: number }).quantity ?? 1),
      actor_uuid: row.actor_uuid ?? null,
      actor_name: row.actor_name ?? null,
      created_at: row.created_at,
    };
  }

  /**
   * Les paiements liés, en **une** requête.
   *
   * ⚠️ Aucune relation ORM ne joint ces tables (les abonnements et les dons sont liés par
   * colonnes `*_uuid` nues) : un `relations:` ne rendrait rien, et charger le paiement ligne
   * par ligne ferait un N+1 sur un chemin déjà appelé pendant un paiement.
   */
  private async loadPayments(
    lines: BlockingLine[],
  ): Promise<Map<string, PaymentEntity>> {
    const uuids = lines.map((l) => l.payment_uuid).filter(Boolean);
    if (!uuids.length) return new Map();

    const payments = await this.paymentRepo.find({
      where: { uuid: In(uuids) },
    });

    return new Map(payments.map((p) => [p.uuid, p]));
  }

  /**
   * `paid` = encaissé · `closed` = refermé · `open` = le guichet la dit encore en cours ·
   * `unknown` = on n'a pas pu lui demander.
   */
  private async verifyOne(
    line: BlockingLine,
    payment: PaymentEntity | undefined,
  ): Promise<'paid' | 'closed' | 'open' | 'unknown'> {
    // Sans paiement rattaché, il n'y a rien à interroger et aucun argent ne peut arriver.
    // On ne referme pas pour autant : c'est une anomalie de données, pas un abandon, et
    // l'écraser en silence ferait disparaître la seule trace du problème. Elle reste donc
    // bloquante - et le membre garde sa sortie par l'annulation, qui elle est explicite.
    if (!payment?.transaction_id) return 'unknown';

    try {
      const result = await this.paymentService.syncHubPaymentByTransactionId(
        payment.transaction_id,
      );

      if (result.status === 'paid') return 'paid';
      if (result.status === 'failed') return 'closed';
      if (result.status === 'not_found') return 'unknown';
      return 'open';
    } catch (error) {
      // Guichet injoignable ou en erreur : la tentative reste bloquante. Ne jamais conclure
      // à l'échec sur une panne réseau - ce serait autoriser un second débit.
      this.logger.warn(
        `Vérification impossible pour ${payment.transaction_id} : `
        + `${(error as Error)?.message ?? 'erreur inconnue'}`,
      );
      return 'unknown';
    }
  }

  private async cancelOne(
    kind: AttemptKind,
    line: BlockingLine,
    payment: PaymentEntity | undefined,
  ): Promise<'canceled' | 'paid' | 'failed'> {
    // Ligne orpheline : aucun lien de paiement à fermer côté guichet, donc rien à annuler
    // là-bas. On referme la ligne locale, sans quoi elle bloquerait pour toujours.
    if (!payment?.transaction_id) {
      await this.closeLineLocally(kind, line.line_uuid);
      return 'canceled';
    }

    try {
      const result = await this.paymentService.cancelHubPaymentByTransactionId(
        payment.transaction_id,
      );
      return result.status === 'paid' ? 'paid' : 'canceled';
    } catch (error) {
      const status =
        error instanceof HttpException ? error.getStatus() : undefined;

      // 409 : le paiement a abouti localement. Ce n'est pas un échec d'annulation,
      // c'est un paiement à honorer - et l'appelant ne doit pas en engager un second.
      if (status === HttpStatus.CONFLICT) return 'paid';

      // 404 : la passerelle ne connaît pas ce lien. Aucun encaissement ne peut plus en
      // venir, mais la ligne locale, elle, continuerait de bloquer indéfiniment. On la
      // referme ici - c'est le seul endroit où l'information « ce lien n'existe pas »
      // nous parvient. ⚠️ Le PAIEMENT est refermé avec elle : ne fermer que la ligne
      // laissait le cron interroger ce lien à chaque passage et la console d'assistance
      // afficher un ticket sur une tentative déjà close (constaté en recette).
      if (status === HttpStatus.NOT_FOUND) {
        await this.paymentService.closeUnknownPaymentLink(payment);
        return 'canceled';
      }

      this.logger.warn(
        `Annulation impossible pour ${payment.transaction_id} : `
        + `${(error as Error)?.message ?? 'erreur inconnue'}`,
      );
      return 'failed';
    }
  }

  /** Referme une ligne métier sans passer par le guichet (cas sans lien de paiement). */
  private async closeLineLocally(kind: AttemptKind, lineUuid: string) {
    const repo =
      kind === 'subscription'
        ? this.subscriptionPaymentRepo
        : this.donatePaymentRepo;

    await repo.update({ uuid: lineUuid }, { status: GlobalStatus.CANCELED });
  }

  private toOpenAttempt(
    line: BlockingLine,
    payment: PaymentEntity | undefined,
    verified: boolean,
  ): OpenAttempt {
    return {
      line_uuid: line.line_uuid,
      payment_uuid: line.payment_uuid,
      transaction_id: payment?.transaction_id ?? null,
      amount: line.amount,
      quantity: line.quantity,
      actor_name: line.actor_name,
      actor_uuid: line.actor_uuid,
      created_at: line.created_at,
      age_minutes: this.ageInMinutes(line.created_at),
      verified,
    };
  }

  private ageInMinutes(createdAt: Date): number {
    const ms = Date.now() - new Date(createdAt).getTime();
    // Une date future (horloge décalée) donnerait un âge négatif, donc « jamais abandonnée »
    // et un membre bloqué sans issue : on la ramène à 0, pas en dessous.
    return Math.max(0, Math.floor(ms / 60000));
  }

  private emptyReview(): PendingAttemptReview {
    return {
      open: [],
      closed: 0,
      settled_paid: 0,
      partial: false,
      oldest_age_minutes: null,
      stale: false,
    };
  }
}

/** Vue commune aux lignes d'abonnement et de zaimu, pour n'écrire la logique qu'une fois. */
interface BlockingLine {
  line_uuid: string;
  payment_uuid: string;
  amount: number;
  quantity: number;
  actor_uuid: string | null;
  actor_name: string | null;
  created_at: Date;
}
