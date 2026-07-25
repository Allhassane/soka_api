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
    failureCode?: string | null;
    failureMessage?: string | null;
  } | null;
}

interface HubErrorResponse {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

@Injectable()
export class HubService {
  private readonly apiKey = process.env.HUB_API_KEY;
  private readonly returnUrl = process.env.HUB_RETURN_URL;
  private readonly apiUrl =
    process.env.HUB_API_URL ??
    'https://pay-api.sokagakkaici.org/api/v1/payment-links';

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

      console.error('Erreur Hub status :', error.response?.data ?? error.message);

      throw new InternalServerErrorException(
        `Erreur Hub : ${error.response?.data?.message ?? error.message}`,
      );
    }
  }
}
