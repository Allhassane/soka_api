/// <reference types="jest" />
import { NotFoundException } from '@nestjs/common';
import {
  EffectifsAbonnementsService,
  LignePaiementRapport,
  construireArbre,
} from './effectifs-abonnements.service';

/**
 * **Rapport public d'effectifs et d'abonnements.**
 *
 * Ce que ces tests verrouillent :
 *
 * 1. 🚨 **La clé.** Une clé absente de la configuration ferme la route (404), elle ne l'ouvre
 *    pas : une variable oubliée au déploiement ne doit jamais publier les effectifs de
 *    l'organisation. Une clé fausse rend 404 et non 403 - un 403 confirmerait que l'URL existe.
 * 2. 🚨 **Les abonnés ne s'additionnent PAS.** Un bénéficiaire présent dans deux chapitres
 *    (paiements reçus dans deux structures) serait compté deux fois au national. Le total de
 *    chaque niveau se recalcule en DISTINCT, jamais en somme des enfants.
 * 3. **Les abonnements et les membres, eux, se somment** : une quantité appartient à un seul
 *    paiement, un membre à une seule structure.
 */

const CHEMIN = {
  region_uuid: 'r1',
  region_nom: 'REGION SUD',
  centre_regional_uuid: 'cr1',
  centre_regional_nom: 'CR 1',
  centre_uuid: 'c1',
  centre_nom: 'CENTRE A',
  chapitre_uuid: 'ch1',
  chapitre_nom: 'CHAPITRE 1',
};

const paiement = (
  beneficiaire: string,
  quantite: number,
  surcharge: Partial<LignePaiementRapport> = {},
): LignePaiementRapport => ({
  ...CHEMIN,
  beneficiary_uuid: beneficiaire,
  quantity: quantite,
  ...surcharge,
});

function makeService(cle?: string) {
  const service = new EffectifsAbonnementsService(
    { query: jest.fn(async () => []) } as never,
    { rapportPublicKey: cle ?? '' } as never,
  );
  return service;
}

describe('EffectifsAbonnementsService - la clé', () => {
  it('🚨 ferme la route quand la clé n’est PAS configurée, même si l’appelant en fournit une', () => {
    const service = makeService('');

    expect(() => service.assertCle('nimporte')).toThrow(NotFoundException);
    expect(() => service.assertCle(undefined)).toThrow(NotFoundException);
  });

  it('refuse une clé absente de la requête', () => {
    const service = makeService('cle-secrete-123456');

    expect(() => service.assertCle(undefined)).toThrow(NotFoundException);
    expect(() => service.assertCle('')).toThrow(NotFoundException);
  });

  it('refuse une clé fausse - et par un 404, jamais un 403', () => {
    const service = makeService('cle-secrete-123456');

    expect(() => service.assertCle('cle-secrete-123457')).toThrow(NotFoundException);
    // Une clé plus courte ne doit pas non plus passer (ni faire planter la comparaison).
    expect(() => service.assertCle('cle')).toThrow(NotFoundException);
  });

  it('accepte la bonne clé', () => {
    const service = makeService('cle-secrete-123456');

    expect(() => service.assertCle('cle-secrete-123456')).not.toThrow();
  });
});

describe('construireArbre', () => {
  it('compte un bénéficiaire UNE SEULE FOIS malgré plusieurs paiements', () => {
    const arbre = construireArbre(
      [paiement('m1', 1), paiement('m1', 2), paiement('m2', 1)],
      new Map([['ch1', 40]]),
    );

    const chapitre = arbre.regions[0].centres_regionaux[0].centres[0].chapitres[0];
    expect(chapitre.totaux.abonnes).toBe(2);
    // Les quantités, elles, s'additionnent : 1 + 2 + 1.
    expect(chapitre.totaux.abonnements).toBe(4);
    expect(chapitre.totaux.membres).toBe(40);
  });

  it('🚨 ne double-compte PAS un bénéficiaire présent dans deux chapitres', () => {
    const arbre = construireArbre(
      [
        paiement('m1', 1),
        paiement('m1', 1, {
          chapitre_uuid: 'ch2',
          chapitre_nom: 'CHAPITRE 2',
        }),
      ],
      new Map([
        ['ch1', 10],
        ['ch2', 20],
      ]),
    );

    const centre = arbre.regions[0].centres_regionaux[0].centres[0];
    // Chaque chapitre le compte pour 1…
    expect(centre.chapitres.map((c) => c.totaux.abonnes)).toEqual([1, 1]);
    // …mais le centre, la région et le national ne le comptent qu'une fois.
    expect(centre.totaux.abonnes).toBe(1);
    expect(arbre.regions[0].totaux.abonnes).toBe(1);
    expect(arbre.totaux.abonnes).toBe(1);
    // Les membres, eux, se somment sans risque : un membre a UNE structure.
    expect(centre.totaux.membres).toBe(30);
  });

  it('somme les abonnements et les membres jusqu’au national', () => {
    const arbre = construireArbre(
      [
        paiement('m1', 3),
        paiement('m2', 2, {
          region_uuid: 'r2',
          region_nom: 'REGION NORD',
          centre_regional_uuid: 'cr2',
          centre_regional_nom: 'CR 2',
          centre_uuid: 'c2',
          centre_nom: 'CENTRE B',
          chapitre_uuid: 'ch2',
          chapitre_nom: 'CHAPITRE 2',
        }),
      ],
      new Map([
        ['ch1', 10],
        ['ch2', 5],
      ]),
    );

    expect(arbre.regions).toHaveLength(2);
    expect(arbre.totaux.abonnements).toBe(5);
    expect(arbre.totaux.membres).toBe(15);
    expect(arbre.totaux.abonnes).toBe(2);
  });

  it('rend un chapitre SANS aucun paiement, avec ses membres', () => {
    // Sinon un chapitre qui n'a rien vendu disparaîtrait du rapport - et on lirait son
    // absence comme « il n'existe pas », pas comme « il n'a aucun abonné ».
    const arbre = construireArbre([], new Map(), [
      { ...CHEMIN, membres: 12 },
    ]);

    const chapitre = arbre.regions[0].centres_regionaux[0].centres[0].chapitres[0];
    expect(chapitre.totaux).toEqual({ abonnes: 0, abonnements: 0, membres: 12 });
  });
});

/**
 * 🚨 **Rien ne doit disparaître du rapport.**
 *
 * Relevé sur données réelles le 2026-08-27 : un abonnement payé (ANSELME DE LOTUS KOSSA,
 * 15 000 F.CFA) était **absent du rapport** parce que sa fiche membre a été supprimée le 20/08,
 * APRÈS son paiement. Le total national tombait à 1 097 au lieu de 1 098 - un écart d'un seul
 * franc-abonné, donc invisible à l'œil, et pourtant de l'argent réellement encaissé.
 *
 * Un paiement qu'on ne sait pas rattacher n'est donc PAS écarté : il est compté au national et
 * isolé dans `non_rattaches`, avec son motif. L'invariant qui en découle, et que ces tests
 * verrouillent : **national = somme des régions + non rattachés**.
 */
describe('construireArbre - les paiements non rattachables', () => {
  const orphelin = (beneficiaire: string, quantite: number, motif: string) =>
    ({
      beneficiary_uuid: beneficiaire,
      quantity: quantite,
      motif_non_rattachement: motif,
      region_uuid: null,
      region_nom: null,
      centre_regional_uuid: null,
      centre_regional_nom: null,
      centre_uuid: null,
      centre_nom: null,
      chapitre_uuid: null,
      chapitre_nom: null,
    }) as unknown as LignePaiementRapport;

  it('compte l’orphelin au NATIONAL et l’isole, au lieu de le perdre', () => {
    const arbre = construireArbre(
      [paiement('m1', 1), orphelin('m9', 1, 'membre supprimé')],
      new Map([['ch1', 10]]),
      [{ ...CHEMIN, membres: 10 }],
    );

    // Le national est COMPLET…
    expect(arbre.totaux.abonnes).toBe(2);
    expect(arbre.totaux.abonnements).toBe(2);
    // …la pyramide ne porte que le rattachable…
    expect(arbre.regions[0].totaux.abonnes).toBe(1);
    // …et l'écart est nommé, pas silencieux.
    expect(arbre.non_rattaches.abonnes).toBe(1);
    expect(arbre.non_rattaches.abonnements).toBe(1);
    expect(arbre.non_rattaches.motifs).toEqual([
      { motif: 'membre supprimé', abonnes: 1, abonnements: 1 },
    ]);
  });

  it('tient l’invariant : national = régions + non rattachés', () => {
    const arbre = construireArbre(
      [
        paiement('m1', 2),
        paiement('m2', 1),
        orphelin('m9', 3, 'structure hors arbre'),
      ],
      new Map([['ch1', 10]]),
      [{ ...CHEMIN, membres: 10 }],
    );

    const parRegions = arbre.regions.reduce((n, r) => n + r.totaux.abonnements, 0);
    expect(parRegions + arbre.non_rattaches.abonnements).toBe(
      arbre.totaux.abonnements,
    );
  });

  it('ne crée aucun bloc « non rattachés » quand tout se rattache', () => {
    const arbre = construireArbre([paiement('m1', 1)], new Map([['ch1', 10]]), [
      { ...CHEMIN, membres: 10 },
    ]);

    expect(arbre.non_rattaches.abonnements).toBe(0);
    expect(arbre.non_rattaches.motifs).toEqual([]);
  });
});
