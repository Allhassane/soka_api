/**
 * Permission UNIQUE du module Contrôle : le menu, la page et ses routes (lecture seule).
 * Cochée pour ADMINISTRATEUR seul à sa création ; les autres rôles s'ouvrent dans
 * Paramètres → Rôles.
 */
export const CONTROLE = 'controle_voir_menu_controle';

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Ce qui se compte sur un ensemble de paiements réussis d'une campagne d'abonnement. */
export interface ChiffresControle {
  /** Paiements réussis (= « Paiement réussi » de la Comptabilité). */
  paiements: number;
  /** Somme de `payments.total_amount`. */
  montant: number;
  /** Somme des quantités payées : 1 unité = 1 journal. */
  journaux: number;
  /** Bénéficiaires DISTINCTS : un membre qui paie deux fois reste UN abonné. */
  abonnes: number;
  /** Paiements dont le montant n'est pas quantité × tarif (ou sans quantité). */
  hors_tarif: number;
}

/** Un paiement qui empêche les comptes de tomber juste, nommé pour être retrouvé. */
export interface AnomalieControle {
  transaction_id: string | null;
  date: string | null;
  beneficiaire: string | null;
  montant: number;
  quantite: number | null;
  motif: 'hors_tarif' | 'sans_region';
}

export interface EntreeControle {
  campagne: {
    uuid: string;
    nom: string;
    statut: string;
    annee: number | null;
    /** Prix d'UN journal : le montant unitaire de la campagne. */
    tarif: number;
  };
  /** Commission HUB2 (`tauxCommissionHub2`). */
  taux: number;
  global: ChiffresControle;
  regions: Array<{ uuid: string; nom: string; chiffres: ChiffresControle }>;
  anomalies: AnomalieControle[];
}

/**
 * **La trame du contrôle d'un abonnement**, fonction PURE : elle ne lit rien, elle met en forme
 * et vérifie. C'est ce qui rend la règle vérifiable sans base.
 *
 * Trois contrôles, et « cohérent » = les trois :
 * - `montant_tarif` : montant collecté ÷ tarif = journaux payés ;
 * - `regions` : tous les journaux sont rattachés à une région (sinon ils sont NOMMÉS dans
 *   `hors_region`, jamais perdus : la somme des lignes retombe toujours sur le total) ;
 * - `tarif` : chaque paiement vaut quantité × tarif.
 */
export function construireControle(e: EntreeControle) {
  const { campagne, global } = e;
  const tarif = Number(campagne.tarif) || 0;

  const regions = e.regions
    .map((r) => ({ uuid: r.uuid, nom: r.nom, ...sansHorsTarif(r.chiffres) }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  // Les régions sont disjointes (un membre a UNE structure) : ce qui manque à leur somme n'a
  // pas de région. Soustraire est donc exact, abonnés compris.
  const somme = (cle: 'paiements' | 'montant' | 'journaux' | 'abonnes') =>
    regions.reduce((s, r) => s + r[cle], 0);
  const horsRegion = {
    paiements: global.paiements - somme('paiements'),
    montant: arrondi(global.montant - somme('montant')),
    journaux: global.journaux - somme('journaux'),
    abonnes: global.abonnes - somme('abonnes'),
  };
  const aHorsRegion = Object.values(horsRegion).some((v) => v !== 0);

  const journauxDuMontant = tarif > 0 ? arrondi(global.montant / tarif) : null;
  const commission = arrondi(global.montant * e.taux);

  const controles = {
    montant_tarif: journauxDuMontant !== null && journauxDuMontant === global.journaux,
    regions: !aHorsRegion,
    tarif: global.hors_tarif === 0,
  };

  return {
    campagne: { ...campagne, tarif },
    montant_collecte: global.montant,
    journaux_du_montant: journauxDuMontant,
    regions,
    hors_region: aHorsRegion ? horsRegion : null,
    total_journaux: global.journaux,
    total_abonnes: global.abonnes,
    paiements: global.paiements,
    /** Le compte exact (la liste `anomalies` est bornée à 50 par motif). */
    paiements_hors_tarif: global.hors_tarif,
    produit: global.journaux * tarif,
    commission: { taux: e.taux, montant: commission },
    net: arrondi(global.montant - commission),
    controles,
    coherent: controles.montant_tarif && controles.regions && controles.tarif,
    anomalies: e.anomalies,
  };
}

const sansHorsTarif = ({ paiements, montant, journaux, abonnes }: ChiffresControle) => ({
  paiements,
  montant,
  journaux,
  abonnes,
});
