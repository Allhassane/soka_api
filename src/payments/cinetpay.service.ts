import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class CinetPayService {
  private readonly apiKey = process.env.CINET_API_KEY;
  private readonly siteId = process.env.CINET_SITE_ID;
  private readonly notifyUrl = process.env.CINET_NOTIFY_URL;
  private readonly returnUrl = process.env.CINET_RETURN_URL;

  async initPayment(amount: number, description: string, transactionId: string) {
    try {
      const payload = {
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: transactionId,
        amount: amount,
        currency: 'XOF',
        description,
        notify_url: this.notifyUrl,
        return_url: this.returnUrl,
        customer_surname: "Paiement membre",
      };

      const response = await axios.post(
        'https://api-checkout.cinetpay.com/v2/payment',
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      );

      if (response.data.code !== '201')
        throw new InternalServerErrorException('Erreur CinetPay : ' + response.data.message);

      return {
        payment_url: response.data.data.payment_url,
        transactionId,
      };
    } catch (error) {
      throw new InternalServerErrorException(`Erreur CinetPay : ${error.message}`);
    }
  }
}
