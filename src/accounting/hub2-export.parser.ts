import * as XLSX from 'xlsx';

/**
 * Lecture d'un export HUB2 (CSV ou XLSX).
 *
 * Colonnes constatées sur l'export de référence (`STAT_SOKA_HUB2_V2.xlsx`, feuille `Export`) :
 * `paymentId, merchantId, amount, fees, currency, createdAtDate, createdAtTime, updatedAtDate,
 * updatedAtTime, customerReference, purchaseReference, status, method, country, provider,
 * msisdn, failureCode, failureMessage`.
 *
 * ⚠️ **Tolérant aux colonnes supplémentaires et à leur ordre** : HUB2 peut en ajouter, et un
 * parseur positionnel se serait cassé en silence au premier changement de format. Seul
 * `paymentId` est obligatoire - sans lui la ligne n'est rapprochable par rien.
 *
 * ⚠️ **La date est en DEUX colonnes**, l'heure portant le suffixe `Z` (`"22:43:15.455Z"`) :
 * c'est de l'UTC. Les recoller sans le `Z` ferait interpréter l'heure en local et décalerait
 * tout l'export d'un fuseau - assez pour faire basculer des transactions d'un jour à l'autre et
 * fausser un rapprochement par période.
 */
export interface Hub2ExportLine {
  paymentId: string;
  amount: number;
  fees: number;
  status: string;
  provider: string | null;
  msisdn: string | null;
  purchaseReference: string | null;
  createdAt: Date | null;
}

export interface Hub2ExportParseResult {
  lignes: Hub2ExportLine[];
  /** Lignes écartées faute de `paymentId` exploitable, avec leur numéro (1 = 1re ligne de données). */
  ignorees: number[];
}

/** `1 234,56` ou `"1234.56"` → 1234.56 ; vide/illisible → 0. */
function nombre(valeur: unknown): number {
  if (typeof valeur === 'number') return Number.isFinite(valeur) ? valeur : 0;
  if (valeur === null || valeur === undefined) return 0;
  const nettoye = String(valeur).replace(/\s/g, '').replace(/,/g, '.');
  const n = Number(nettoye);
  return Number.isFinite(n) ? n : 0;
}

function texte(valeur: unknown): string | null {
  if (valeur === null || valeur === undefined) return null;
  const s = String(valeur).trim();
  return s === '' ? null : s;
}

/**
 * Recompose la date UTC à partir des deux colonnes de l'export.
 * Renvoie `null` plutôt qu'une `Invalid Date` : une date illisible ne doit pas contaminer un
 * filtre de période ni faire échouer l'insertion de toute la ligne.
 */
export function recomposerDate(date: unknown, heure: unknown): Date | null {
  const d = texte(date);
  if (!d) return null;

  const h = texte(heure) ?? '00:00:00Z';
  // L'export porte déjà le `Z` ; on ne l'ajoute que s'il manque, sans jamais l'enlever.
  const heureUtc = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(h) ? h : `${h}Z`;
  const recompose = new Date(`${d.replace(/\//g, '-')}T${heureUtc}`);
  return Number.isNaN(recompose.getTime()) ? null : recompose;
}

/**
 * @param buffer contenu du fichier (CSV ou XLSX - `xlsx` reconnaît les deux)
 * @param feuille nom de la feuille à lire ; par défaut `Export` si elle existe, sinon la première
 */
export function parseHub2Export(buffer: Buffer, feuille?: string): Hub2ExportParseResult {
  const classeur = XLSX.read(buffer, { type: 'buffer', raw: false });

  const nomFeuille =
    feuille
    ?? classeur.SheetNames.find((n) => n.toLowerCase() === 'export')
    ?? classeur.SheetNames[0];

  if (!nomFeuille || !classeur.Sheets[nomFeuille]) {
    throw new Error('Fichier illisible : aucune feuille exploitable.');
  }

  const brutes = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    classeur.Sheets[nomFeuille],
    { defval: '' },
  );

  const lignes: Hub2ExportLine[] = [];
  const ignorees: number[] = [];

  brutes.forEach((ligne, index) => {
    // Les en-têtes sont normalisées : un export dont une colonne passe de `paymentId` à
    // `PaymentID` ne doit pas produire un fichier « vide » sans explication.
    const champs = new Map<string, unknown>();
    for (const [cle, valeur] of Object.entries(ligne)) {
      champs.set(cle.trim().toLowerCase(), valeur);
    }

    const paymentId = texte(champs.get('paymentid'));
    if (!paymentId) {
      ignorees.push(index + 1);
      return;
    }

    lignes.push({
      paymentId,
      amount: nombre(champs.get('amount')),
      fees: nombre(champs.get('fees')),
      status: (texte(champs.get('status')) ?? 'unknown').toLowerCase(),
      provider: texte(champs.get('provider'))?.toLowerCase() ?? null,
      msisdn: texte(champs.get('msisdn')),
      purchaseReference: texte(champs.get('purchasereference')),
      createdAt: recomposerDate(champs.get('createdatdate'), champs.get('createdattime')),
    });
  });

  return { lignes, ignorees };
}
