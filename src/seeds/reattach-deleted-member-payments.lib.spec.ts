import { ficheActiveJumelle } from './reattach-deleted-member-payments.lib';

/**
 * Rattachement des paiements réussis portés par une fiche SUPPRIMÉE à la fiche active de la même
 * personne (RESPO-COMPTA-REGUL, 2026-09-27). La règle doit être stricte : rattacher un paiement à
 * la mauvaise personne serait pire que de le laisser où il est.
 */
const supprimee = {
  uuid: 'fiche-supprimee',
  firstname: ' Anselme de  Lotus ',
  lastname: 'kossa',
  phone: '+225 07 00 00 00 27',
};

describe('ficheActiveJumelle', () => {
  it('retient l\'UNIQUE fiche active de même nom ET même téléphone (formats ignorés)', () => {
    const r = ficheActiveJumelle(supprimee, [
      { uuid: 'jumelle', firstname: 'ANSELME DE LOTUS', lastname: 'KOSSA', phone: '0700000027' },
      { uuid: 'homonyme', firstname: 'ANSELME DE LOTUS', lastname: 'KOSSA', phone: '0500000099' },
      { uuid: 'meme-tel', firstname: 'AUTRE', lastname: 'PERSONNE', phone: '0700000027' },
    ]);
    expect(r).toEqual({ fiche: expect.objectContaining({ uuid: 'jumelle' }), motif: null });
  });

  it('refuse un homonyme sur un autre téléphone', () => {
    const r = ficheActiveJumelle(supprimee, [
      { uuid: 'homonyme', firstname: 'ANSELME DE LOTUS', lastname: 'KOSSA', phone: '0500000099' },
    ]);
    expect(r.fiche).toBeNull();
    expect(r.motif).toMatch(/aucune fiche active/);
  });

  it('refuse l\'ambiguïté : deux fiches actives jumelles', () => {
    const jumelle = { firstname: 'ANSELME DE LOTUS', lastname: 'KOSSA', phone: '0700000027' };
    const r = ficheActiveJumelle(supprimee, [{ uuid: 'a', ...jumelle }, { uuid: 'b', ...jumelle }]);
    expect(r.fiche).toBeNull();
    expect(r.motif).toMatch(/plusieurs fiches actives/);
  });

  it('refuse une fiche supprimée sans téléphone : rien ne permet d\'affirmer que c\'est la même personne', () => {
    const r = ficheActiveJumelle({ ...supprimee, phone: null }, [
      { uuid: 'jumelle', firstname: 'ANSELME DE LOTUS', lastname: 'KOSSA', phone: null },
    ]);
    expect(r.fiche).toBeNull();
  });
});
