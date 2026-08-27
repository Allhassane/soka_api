import { BadRequestException } from '@nestjs/common';

/**
 * Permission UNIQUE du module Comptabilité : elle commande le menu et tout ce qu'il contient
 * (décision produit du 2026-08-10 - le module est en lecture seule sur les paiements, découper
 * aurait produit des rôles capables de constater un écart sans pouvoir le rafraîchir).
 */
export const COMPTABILITE = 'comptabilite_voir_menu_comptabilite';

/**
 * Les deux sources de paiement que le module sait filtrer : les valeurs de `payments.source`.
 * `shop_item` existe dans l'enum mais ne porte aucune campagne - il n'a pas sa place ici.
 */
export type SourceStats = 'subscription' | 'donation';
export const SOURCES_STATS: SourceStats[] = ['subscription', 'donation'];

/** Les seaux d'une carte KPI : `all` + les quatre valeurs de `payments.payment_status`. */
export type BucketStats = 'all' | 'paid' | 'pending' | 'failed' | 'cancelled';
export const BUCKETS_STATS: BucketStats[] = ['all', 'paid', 'pending', 'failed', 'cancelled'];

/**
 * 🚨 Les deux validations vivent ICI parce que **l'écran et l'export doivent parler du même
 * seau**. L'export d'une tuile doit rendre exactement les lignes que la tuile compte : deux
 * définitions du mot « échoué » feraient diverger le fichier et le chiffre affiché, et
 * personne ne s'en apercevrait avant de compter à la main.
 */
export function verifierSource(type: string): SourceStats {
  if (!SOURCES_STATS.includes(type as SourceStats)) {
    throw new BadRequestException({
      message: 'Type inconnu : attendu `subscription` (abonnements) ou `donation` (zaimu).',
      data: { code: 'TYPE_INVALIDE' },
    });
  }
  return type as SourceStats;
}

export function verifierBucket(bucket?: string): BucketStats {
  const valeur = (bucket ?? 'all') as BucketStats;
  if (!BUCKETS_STATS.includes(valeur)) {
    throw new BadRequestException({
      message: 'Catégorie inconnue : attendu all, paid, pending, failed ou cancelled.',
      data: { code: 'BUCKET_INVALIDE' },
    });
  }
  return valeur;
}

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
