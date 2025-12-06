import { Injectable, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class CinetPayService {
  private readonly apiKey = process.env.CINET_API_KEY;
  private readonly siteId = process.env.CINET_SITE_ID;
  private readonly notifyUrl = process.env.CINET_NOTIFY_URL;
  private readonly returnUrl = process.env.CINET_RETURN_URL;

  // Fonction de normalisation du numéro de téléphone
  private formatPhone(phone?: string): string {
    if (!phone || phone.trim() === '') {
      return '+225000000000'; // valeur par défaut valide
    }

    let cleaned = phone
      .replace(/\s+/g, '')    // retire espaces
      .replace(/-/g, '')      // retire tirets
      .replace(/\(/g, '')     // retire parenthèses
      .replace(/\)/g, '');

    // Si commence par 00225 → remplace par +225
    if (cleaned.startsWith('00225')) {
      cleaned = '+225' + cleaned.substring(5);
    }

    // Si commence déjà par +225 → OK
    if (cleaned.startsWith('+225')) {
      return cleaned;
    }

    // Si commence par 0 → retirer le 0 et ajouter +225
    if (cleaned.startsWith('00')) {
      return '+225' + cleaned.substring(1);
    }

    // Sinon → ajouter +225
    return '+225' + cleaned;
  }

  async initPayment(
    amount: number,
    description: string,
    transactionId: string,
    customer: {
      id: string;
      name: string;
      surname: string;
      email?: string;
      phone?: string;
    }
  ) {
    try {
      const safeEmail = customer.email?.trim() || 'noemail@soka-ci.org';
      const safePhone = this.formatPhone(customer.phone);


      const payload = {
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: transactionId,
        amount: amount,
        currency: 'XOF',
        alternative_currency: '',
        description: description,

        // --- CUSTOMER ---
        customer_id: customer.id,
        customer_name: customer.name || 'NON DEFINI',
        customer_surname: customer.surname || 'NON DEFINI',
        customer_email: safeEmail,
        customer_phone_number: safePhone,
        customer_address: 'Abidjan',
        customer_city: 'Abidjan',
        customer_country: 'CI',
        customer_state: 'CI',
        customer_zip_code: '00000',

        // --- CALLBACKS ---
        notify_url: this.notifyUrl,
        return_url: this.returnUrl+'/'+transactionId ,

        // --- OPTIONS ---
        channels: 'ALL',
        lang: 'FR',
        metadata: customer.id,

        invoice_data: {
          Donnee1: '',
          Donnee2: '',
          Donnee3: '',
        }
      };

      console.log('Payload envoyé à CinetPay :', payload);

      const response = await axios.post(
        'https://api-checkout.cinetpay.com/v2/payment',
        payload,
        { headers: { 'Content-Type': 'application/json' } }
      );

    //  console.log('Réponse CinetPay :', response.data);

      if (response.data.code !== '201') {
        throw new InternalServerErrorException(
          'Erreur CinetPay : ' + response.data.message
        );
      }

      return {
        payment_url: response.data.data.payment_url,
        transactionId,
      };
    } catch (error) {
      console.error('Erreur CinetPay :', error.response?.data ?? error.message);

      throw new InternalServerErrorException(
        `Erreur CinetPay : ${error.response?.data?.message ?? error.message}`
      );
    }
  }
}
