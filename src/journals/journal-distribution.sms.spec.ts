/// <reference types="jest" />
import { prefixeSender } from './journal-distribution.service';
import { SMS_SENDER_ID } from 'src/shared/constants/constants';

/**
 * Règle vérifiée ici : **tout SMS sortant s'ouvre sur le sender ID**.
 *
 * Les notifications de distribution du journal étaient le dernier envoi de l'API à partir sans -
 * un correspondant recevait « Bonjour … » sous l'expéditeur « SOKA », sans que le nom de
 * l'association apparaisse nulle part dans le texte.
 */
describe('SMS des notifications Journal - ouverture sur le sender ID', () => {
  it('pose le sender ID en tête du message', () => {
    expect(prefixeSender('Bonjour Marc, le journal est prêt.')).toBe(
      `${SMS_SENDER_ID} : Bonjour Marc, le journal est prêt.`,
    );
  });

  it('ne double PAS le préfixe si le gabarit personnalisé le porte déjà', () => {
    const deja = `${SMS_SENDER_ID} : Rappel de distribution.`;
    expect(prefixeSender(deja)).toBe(deja);
  });

  it('ouvre bien sur « SOKA CI », pas sur « SOKA »', () => {
    // Le bug d'origine : le message s'annonçait « SOKA : … » sous l'expéditeur « SOKA CI ».
    expect(prefixeSender('Test.')).toMatch(/^SOKA CI : /);
  });
});
