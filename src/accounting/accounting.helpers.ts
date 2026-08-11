import { BadRequestException } from '@nestjs/common';

/**
 * Permission UNIQUE du module Comptabilité : elle commande le menu et tout ce qu'il contient
 * (décision produit du 2026-08-10 — le module est en lecture seule sur les paiements, découper
 * aurait produit des rôles capables de constater un écart sans pouvoir le rafraîchir).
 */
export const COMPTABILITE = 'comptabilite_voir_menu_comptabilite';

/** Convertit un paramètre de requête en date, avec un refus lisible par l'écran. */
export function versDate(valeur?: string, champ = 'date'): Date | undefined {
  if (!valeur) return undefined;
  const d = new Date(valeur);
  if (Number.isNaN(d.getTime())) {
    throw new BadRequestException({
      message: `Le paramètre « ${champ} » n'est pas une date valide.`,
      data: { code: 'DATE_INVALIDE', champ },
    });
  }
  return d;
}
