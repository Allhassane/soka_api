import { construireFeuilleCompta } from './accounting-payments-sheet';

/**
 * **Le contenu du fichier exporté depuis la Comptabilité.**
 *
 * Quatre blocs demandés : la transaction, le **payeur SANS sa structure**, le bénéficiaire, et
 * la structure du bénéficiaire palier par palier.
 *
 * 🚨 L'absence de « Acteur - Structure » est une exigence, pas un oubli : c'est la seule
 * différence de contenu avec l'export du module Exports, et rien d'autre dans le code ne la
 * rappellerait. Quelqu'un qui recopierait les colonnes de `processTransactionsExport` la
 * réintroduirait sans s'en apercevoir.
 */

const paiement = {
  transaction_id: 'plink_ABC',
  source: 'subscription',
  payment_status: 'failed',
  status: 'fail',
  created_at: new Date('2026-08-18T17:19:00Z'),
  paid_at: null,
  amount: 15000,
  quantity: 1,
  total_amount: 15000,
  provider: 'orange',
  failure_code: 'authentication_failed',
  failure_message: 'Authentification refusée',
  actor: {
    uuid: 'm-actor',
    firstname: 'BI BOLI',
    lastname: 'TRA',
    phone: '0102030405',
    structure: { name: 'SOUS-GROUPE ABOBO 1' },
  },
  beneficiary: {
    uuid: 'm-benef',
    firstname: 'AKA',
    lastname: 'MARIE',
    phone: '0708091011',
    structure_uuid: 's-benef',
    structure: { name: 'SOUS-GROUPE YOPOUGON 3' },
  },
};

const arbres = new Map<string, any>([
  [
    'm-benef',
    {
      level_name: 'NATIONAL',
      name: 'NATIONAL',
      children: [
        {
          level_name: 'REGION',
          name: 'REGION SUD',
          children: [
            { level_name: 'DISTRICT', name: 'DISTRICT YOPOUGON', children: [] },
          ],
        },
      ],
    },
  ],
]);

describe('construireFeuilleCompta - les colonnes du fichier', () => {
  it('🚨 ne porte AUCUNE colonne de structure du PAYEUR', () => {
    const { colonnes } = construireFeuilleCompta([paiement as never], arbres);

    const entetes = colonnes.map((c) => c.header);
    expect(entetes).not.toContain('Payeur - Structure');
    expect(entetes.some((h) => /payeur/i.test(h) && /structure/i.test(h))).toBe(false);
  });

  it('porte l’identité du payeur : prénom, nom, téléphone', () => {
    const { colonnes, lignes } = construireFeuilleCompta([paiement as never], arbres);

    const cles = colonnes.map((c) => c.key);
    expect(cles).toEqual(
      expect.arrayContaining(['actor_firstname', 'actor_lastname', 'actor_phone']),
    );
    expect(lignes[0]).toMatchObject({
      actor_firstname: 'BI BOLI',
      actor_lastname: 'TRA',
      actor_phone: '0102030405',
    });
  });

  it('porte l’identité du bénéficiaire, structure comprise', () => {
    const { lignes } = construireFeuilleCompta([paiement as never], arbres);

    expect(lignes[0]).toMatchObject({
      beneficiary_firstname: 'AKA',
      beneficiary_lastname: 'MARIE',
      beneficiary_phone: '0708091011',
      beneficiary_structure: 'SOUS-GROUPE YOPOUGON 3',
    });
  });

  it('déplie la structure du bénéficiaire, une colonne par palier', () => {
    const { colonnes, lignes } = construireFeuilleCompta([paiement as never], arbres);

    expect(colonnes.map((c) => c.header)).toEqual(
      expect.arrayContaining(['Bénéficiaire - REGION', 'Bénéficiaire - DISTRICT']),
    );
    expect(lignes[0].beneficiary_structure_level_0).toBe('REGION SUD');
    expect(lignes[0].beneficiary_structure_level_1).toBe('DISTRICT YOPOUGON');
  });

  it('porte la transaction, l’opérateur et le motif d’échec', () => {
    const { lignes } = construireFeuilleCompta([paiement as never], arbres);

    expect(lignes[0]).toMatchObject({
      transaction_id: 'plink_ABC',
      payment_status: 'Échec',
      amount_unit: 15000,
      quantity: 1,
      total_amount: 15000,
      provider: 'orange',
      failure: 'Authentification refusée',
    });
  });

  it('n’invente pas de motif d’échec sur un paiement réussi', () => {
    const reussi = { ...paiement, payment_status: 'paid', failure_message: null, failure_code: null };
    const { lignes } = construireFeuilleCompta([reussi as never], arbres);

    expect(lignes[0].payment_status).toBe('Payé');
    expect(lignes[0].failure).toBe('');
  });

  it('tient un paiement sans bénéficiaire ni arbre sans lever', () => {
    const orphelin = { ...paiement, beneficiary: null };

    expect(() =>
      construireFeuilleCompta([orphelin as never], new Map()),
    ).not.toThrow();
  });
});
