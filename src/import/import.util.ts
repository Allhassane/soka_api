/**
 * Utilitaires purs pour l'import Excel des membres.
 * (Normalisation de comparaison, booléens FR, dates dd/mm/yyyy, téléphone.)
 */

/** Normalise une chaîne pour comparaison : sans accents/casse/séparateurs (espace, - _ / .). */
export function norm(s: unknown): string {
  if (s === null || s === undefined) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques
    .replace(/[\s\-_/.]+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Ne conserve que les chiffres (pour les numéros de téléphone). */
export function digitsOnly(s: unknown): string {
  return String(s ?? '').replace(/\D+/g, '');
}

/** Interprète OUI/O/1/VRAI/TRUE/YES comme vrai ; tout le reste (et vide) comme faux. */
export function parseBool(s: unknown): boolean {
  return ['OUI', 'O', '1', 'TRUE', 'VRAI', 'YES', 'Y'].includes(norm(s));
}

/**
 * Convertit une date « dd/mm/yyyy » (ou dd-mm-yyyy, dd.mm.yyyy) en « YYYY-MM-DD ».
 * Renvoie null si la valeur est vide ou non analysable.
 */
export function parseDateFr(s: unknown): string | null {
  const v = String(s ?? '').trim();
  if (!v) return null;
  const m = v.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  let y = parseInt(m[3], 10);
  if (m[3].length === 2) y = y >= 50 ? 1900 + y : 2000 + y;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}
