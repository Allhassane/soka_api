import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import axios from 'axios';

interface HubPaymentLinkResponse {
  id: string;
  amount: number;
  amountType: string;
  currency: string;
  title: string;
  url: string;
  status: string;
}

interface HubPaymentStatusResponse {
  link?: HubPaymentLinkResponse;
  paid: boolean;
  payment?: {
    id: string;
    status: string;
    amount: number;
    currency: string;
    provider?: string;
    method?: string;
    paidAt?: string;
    /** Création de la transaction chez HUB2 : départ réel de la tentative, pas du lien. */
    createdAt?: string;
    failureCode?: string | null;
    failureMessage?: string | null;
  } | null;
}

/** Réponse de `POST /payment-links/:id/cancel` (gateway SOKA Pay). */
export interface HubCancelResponse {
  canceled: boolean;
  /** `canceled` = fermé ; `already_paid` = une tentative a abouti, rien n'a été touché. */
  reason: 'canceled' | 'already_paid';
  link: string;
  sessions_canceled?: number;
  intents_canceled?: number;
}

interface HubErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

/**
 * Une tentative telle que la **liste marchande** du guichet la rend
 * (`GET /payments`, `paymentView` dans `soka-pay/api/src/server/payments.ts`).
 *
 * 🚨 **`hub2PaymentId` ≠ `id`, et c'est LE piège de la concordance.** `id` est l'identifiant du
 * guichet (28 caractères), `hub2PaymentId` celui de HUB2 (25) ; les deux sont préfixés `pay_`,
 * ils ne sont **jamais** égaux, et **seul `hub2PaymentId` figure dans l'export HUB2** (mesuré :
 * 1 383 des 1 400 lignes de l'export s'apparient par `hub2PaymentId`, **0** par `id`).
 *
 * `linkId` est, lui, exactement le `payments.transaction_id` de l'application : cette liste est
 * donc le pont app ↔ guichet ↔ export, en une seule lecture.
 */
export interface HubGatewayPayment {
  id: string;
  linkId: string;
  status: string;
  provider?: string | null;
  amount: number;
  currency: string;
  failureCode?: string | null;
  hub2PaymentId?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface HubPaymentsPage {
  data: HubGatewayPayment[];
  meta: { page: number; perPage: number; total: number; totalPages: number };
}

@Injectable()
export class HubService {
  private readonly apiKey = process.env.HUB_API_KEY;
  private readonly returnUrl = process.env.HUB_RETURN_URL;
  private readonly apiUrl =
    process.env.HUB_API_URL ??
    'https://pay-api.sokagakkaici.org/api/v1/payment-links';

  /**
   * ⚠️ **Aucun appel au guichet ne doit pouvoir pendre indéfiniment.** Ces trois appels
   * partaient sans `timeout` : par défaut axios attend **sans limite**, et un guichet qui
   * accepte la connexion sans jamais répondre bloquait la requête HTTP (donc un worker Node)
   * jusqu'à ce que le client abandonne. Le risque est devenu concret depuis que la
   * vérification des tentatives en cours est appelée **sur le chemin de l'initiation d'un
   * paiement** : plusieurs appels y sont enchaînés.
   * 8 s, valeur déjà retenue par la console d'assistance (`SOKAPAY_TIMEOUT_MS`) face au
   * même guichet. Un dépassement remonte en `ECONNABORTED`, traité comme une panne guichet.
   */
  private readonly timeoutMs = Number(process.env.HUB_TIMEOUT_MS ?? 8000);

  /**
   * Racine de l'API marchande, déduite de `HUB_API_URL` (qui pointe `…/payment-links`).
   * Déduire plutôt qu'ajouter une variable d'environnement : une seconde variable finirait par
   * diverger de la première, et un guichet mal ciblé ne se voit pas — il rend simplement une
   * concordance vide.
   */
  private get apiRoot(): string {
    return this.apiUrl.replace(/\/payment-links\/?$/, '');
  }

  /**
   * **Liste marchande des tentatives du guichet**, paginée, pour la concordance comptable.
   *
   * C'est la seule voie qui rend `hub2PaymentId` (la clé de l'export HUB2) **et** `linkId`
   * (le `transaction_id` de l'application) : elle apparie les trois mondes en une lecture.
   * `checkPaymentStatus`, lui, ne rend que l'identifiant du guichet - insuffisant pour l'export.
   *
   * ⚠️ **Lecture seule et rien d'autre.** Aucun statut n'est déduit ni écrit ici : le module
   * comptable n'a pas le droit de toucher à l'argent, et une seconde route vers les statuts
   * finirait par diverger de `syncHubPaymentByTransactionId`.
   *
   * ⚠️ Le guichet plafonne `perPage` à **100** : au-delà, il rejette la requête. La pagination
   * est donc obligatoire, pas une optimisation.
   *
   * @param maxPages garde-fou : borne le nombre d'allers-retours (défaut 200 = 20 000 lignes).
   */
  async listGatewayPayments(
    { from, to, maxPages = 200 }: { from?: Date; to?: Date; maxPages?: number } = {},
  ): Promise<{ payments: HubGatewayPayment[]; total: number; complet: boolean }> {
    if (!this.apiKey) {
      throw new InternalServerErrorException('HUB_API_KEY non configurée');
    }

    const perPage = 100;
    const payments: HubGatewayPayment[] = [];
    let page = 1;
    let total = 0;
    let totalPages = 1;

    do {
      const response = await axios.get<HubPaymentsPage>(`${this.apiRoot}/payments`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        params: {
          page,
          perPage,
          ...(from ? { from: from.toISOString() } : {}),
          ...(to ? { to: to.toISOString() } : {}),
        },
        timeout: this.timeoutMs,
      });

      const corps = response.data;
      if (!Array.isArray(corps?.data)) {
        throw new InternalServerErrorException(
          'Réponse du guichet invalide : `data` absent de la liste des paiements',
        );
      }

      payments.push(...corps.data);
      total = corps.meta?.total ?? payments.length;
      totalPages = corps.meta?.totalPages ?? 1;
      page += 1;
    } while (page <= totalPages && page <= maxPages);

    // `complet` dit la vérité sur la couverture : une concordance bâtie sur une liste tronquée
    // annoncerait un écart imaginaire. L'appelant doit pouvoir le signaler plutôt que de
    // présenter un chiffre faux avec assurance.
    return { payments, total, complet: payments.length >= total };
  }

  async initPayment(
    amount: number,
    title: string,
    metadata?: Record<string, unknown>,
    currency = 'XOF',
  ): Promise<{ payment_url: string; transactionId: string }> {
 
    if (!this.apiKey) {
      throw new InternalServerErrorException('HUB_API_KEY non configurée');
    }

    if (!this.returnUrl) {
      throw new InternalServerErrorException('HUB_RETURN_URL non configurée');
    }

    try {
      const response = await axios.post<HubPaymentLinkResponse>(
        this.apiUrl,
        {
          title,
          amount,
          currency,
          returnUrl: this.returnUrl,
          // Identités payeur/bénéficiaire + numéro de pré-remplissage du guichet.
          ...(metadata ? { metadata } : {}),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeoutMs,
        },
      );

      if (!response.data?.id || !response.data?.url) {
        throw new InternalServerErrorException(
          'Réponse Hub invalide : id ou url manquant',
        );
      }

      return {
        payment_url: response.data.url,
        transactionId: response.data.id,
      };
    } catch (error) {
      const hubError = error.response?.data as HubErrorResponse | undefined;

      if (hubError?.error) {
        const message =
          hubError.error.message ??
          hubError.error.code ??
          'Erreur lors de la création du lien de paiement Hub';

        throw new BadRequestException(`Erreur Hub : ${message}`);
      }

      console.error('Erreur Hub :', error.response?.data ?? error.message);

      throw new InternalServerErrorException(
        `Erreur Hub : ${error.response?.data?.message ?? error.message}`,
      );
    }
  }

  /**
   * Annule un lien de paiement et toutes ses tentatives encore vivantes.
   *
   * ⚠️ **HUB2 n'expose aucune annulation** : la gateway ne peut que refermer ses
   * propres portes (lien désactivé, sessions et intentions annulées), ce qui
   * empêche tout NOUVEAU débit. Une autorisation déjà partie chez l'opérateur et
   * validée par le payeur ira, elle, à son terme.
   * ⚠️ La gateway vérifie HUB2 **avant** d'écrire : si une tentative a abouti,
   * elle n'annule rien et renvoie `canceled: false, reason: 'already_paid'`.
   * Ce n'est PAS une erreur - c'est l'information à afficher.
   */
  async cancelPaymentLink(transactionId: string): Promise<HubCancelResponse> {
    if (!this.apiKey) {
      throw new InternalServerErrorException('HUB_API_KEY non configurée');
    }

    try {
      const { data } = await axios.post<HubCancelResponse>(
        `${this.apiUrl}/${encodeURIComponent(transactionId)}/cancel`,
        {},
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: this.timeoutMs,
        },
      );
      return data;
    } catch (error) {
      const hubError = error.response?.data as HubErrorResponse | undefined;

      if (hubError?.error?.code === 'not_found') {
        throw new NotFoundException(
          hubError.error.message ?? 'Lien de paiement introuvable.',
        );
      }

      const message =
        hubError?.error?.message ??
        hubError?.error?.code ??
        error.response?.data?.message ??
        error.message;

      console.error('Erreur Hub annulation :', error.response?.data ?? error.message);
      throw new BadRequestException(`Erreur Hub : ${message}`);
    }
  }

  async checkPaymentStatus(
    transactionId: string,
  ): Promise<HubPaymentStatusResponse> {
    if (!this.apiKey) {
      throw new InternalServerErrorException('HUB_API_KEY non configurée');
    }

    try {
      const response = await axios.get<HubPaymentStatusResponse>(
        `${this.apiUrl}/${transactionId}/status`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
          timeout: this.timeoutMs,
        },
      );

      return response.data;
    } catch (error) {
      const hubError = error.response?.data as HubErrorResponse | undefined;

      if (hubError?.error) {
        if (hubError.error.code === 'not_found') {
          throw new NotFoundException(
            hubError.error.message ?? 'Lien de paiement introuvable.',
          );
        }

        throw new BadRequestException(
          `Erreur Hub : ${hubError.error.message ?? hubError.error.code}`,
        );
      }

      /**
       * ⚠️ Ce journal rendait `Erreur Hub status : ` **vide** quand le guichet répondait un
       * corps vide (`?? ` ne se déclenche pas sur `''`) - le cron de synchronisation
       * empilait donc des lignes muettes, 200 erreurs par passage sans jamais dire
       * laquelle. On nomme systématiquement le code réseau et le statut HTTP, qui suffisent
       * à trancher entre guichet éteint (`ECONNREFUSED`), guichet muet (`ECONNABORTED`,
       * dépassement du timeout) et clé refusée (401).
       */
      const cause =
        error.response?.data && error.response.data !== ''
          ? JSON.stringify(error.response.data).slice(0, 300)
          : error.message;

      console.error(
        `Erreur Hub status [${error.code ?? 'sans code'}]`
        + `[HTTP ${error.response?.status ?? '-'}] ${transactionId} : ${cause}`,
      );

      throw new InternalServerErrorException(
        `Erreur Hub : ${error.response?.data?.message ?? error.message}`,
      );
    }
  }
}
