/**
 * Détail d'une tentative de paiement tel que le guichet (SOKA Pay → HUB2) le rend.
 *
 * Sous-ensemble volontairement étroit de la réponse de `HubService.checkPaymentStatus` :
 * seuls les champs que l'application **conserve** figurent ici. Les autres (`amount`,
 * `currency`, `method`) restent transportés jusqu'au navigateur sans être stockés.
 */
export interface HubPaymentDetails {
  status?: string;
  provider?: string | null;
  paidAt?: string | null;
  failureCode?: string | null;
  failureMessage?: string | null;
  /** Identifiant de transaction HUB2 (`pay_…`) - clé de rapprochement avec l'export HUB2. */
  id?: string | null;
  /** Création de la transaction chez HUB2 = départ réel de la tentative (≠ création du lien). */
  createdAt?: string | null;
}
