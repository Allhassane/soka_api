/**
 * Règle d'appariement de `seed:reattach-deleted-member-payments` (RESPO-COMPTA-REGUL,
 * 2026-09-27) : quelle fiche ACTIVE est la même personne qu'une fiche supprimée ?
 *
 * Stricte par construction - rattacher un paiement à la mauvaise personne serait pire que de le
 * laisser où il est : même téléphone (formats ignorés) ET même nom (accents, casse et espaces
 * ignorés), et une seule candidate. Sans téléphone, rien ne permet d'affirmer l'identité.
 */
export interface FicheMembre {
  uuid: string;
  firstname?: string | null;
  lastname?: string | null;
  phone?: string | null;
}

/** Les 10 derniers chiffres : un numéro ivoirien, qu'il soit saisi `+225 07…`, `0700…` ou espacé. */
export const telephoneNormalise = (telephone?: string | null): string => {
  const chiffres = (telephone ?? '').replace(/\D/g, '');
  return chiffres.length >= 8 ? chiffres.slice(-10) : '';
};

export const nomNormalise = (f: FicheMembre): string =>
  `${f.firstname ?? ''} ${f.lastname ?? ''}`
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

export function ficheActiveJumelle(
  supprimee: FicheMembre,
  actives: FicheMembre[],
): { fiche: FicheMembre | null; motif: string | null } {
  const telephone = telephoneNormalise(supprimee.phone);
  if (!telephone) {
    return { fiche: null, motif: 'fiche supprimée sans téléphone : identité non vérifiable' };
  }
  const nom = nomNormalise(supprimee);
  const jumelles = actives.filter(
    (a) =>
      a.uuid !== supprimee.uuid
      && telephoneNormalise(a.phone) === telephone
      && nomNormalise(a) === nom,
  );
  if (jumelles.length === 1) return { fiche: jumelles[0], motif: null };
  if (jumelles.length === 0) {
    return { fiche: null, motif: 'aucune fiche active de même nom et même téléphone' };
  }
  return { fiche: null, motif: `plusieurs fiches actives jumelles (${jumelles.length})` };
}
