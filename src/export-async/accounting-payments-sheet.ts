import { PaymentEntity } from 'src/payments/entities/payment.entity';

/** Une colonne de la feuille Excel, au format attendu par ExcelJS. */
export interface ColonneFeuille {
  header: string;
  key: string;
  width: number;
}

export interface FeuilleCompta {
  colonnes: ColonneFeuille[];
  lignes: Record<string, any>[];
}

/** Les libellés de statut de l'écran Comptabilité - le fichier doit dire la même chose que lui. */
const LIBELLE_STATUT: Record<string, string> = {
  paid: 'Payé',
  pending: 'En cours',
  failed: 'Échec',
  cancelled: 'Annulé',
};

/**
 * Aplatit l'arbre de structure d'un bénéficiaire en une liste de paliers.
 * `sauterRacine` retire le NATIONAL, identique pour tout le monde et donc sans information.
 */
export function aplatirArbre(
  arbre: any,
  sauterRacine = true,
): { paliers: string[]; structures: string[] } {
  const paliers: string[] = [];
  const structures: string[] = [];

  if (arbre) {
    if (!sauterRacine) {
      paliers.push(arbre.level_name || '');
      structures.push(arbre.name || '');
    }
    for (const enfant of arbre.children ?? []) {
      const bas = aplatirArbre(enfant, false);
      paliers.push(...bas.paliers);
      structures.push(...bas.structures);
    }
  }

  return { paliers, structures };
}

/**
 * **Le contenu du fichier exporté depuis la Comptabilité**, en fonction pure : elle ne lit
 * rien et n'écrit rien, elle transforme des paiements en colonnes et en lignes.
 *
 * C'est ce qui rend le contenu vérifiable sans base ni disque - et le contenu est précisément
 * ce qui a été négocié avec l'utilisateur.
 *
 * 🚨 **Aucune colonne de structure pour le PAYEUR** (exigence du 2026-08-26). C'est la seule
 * différence de contenu avec l'export du module Exports : recopier les colonnes de
 * `processTransactionsExport` la ferait disparaître sans bruit. Un test la verrouille.
 *
 * ⚠️ Les colonnes de paliers sont déduites d'un arbre **exemple**. Tous les bénéficiaires
 * n'ont pas la même profondeur : une ligne plus profonde que l'exemple perdrait ses derniers
 * paliers. On prend donc le plus profond des arbres, pas le premier venu.
 */
export function construireFeuilleCompta(
  paiements: PaymentEntity[],
  arbresParBeneficiaire: Map<string, any>,
): FeuilleCompta {
  // Le plus PROFOND des arbres donne le jeu de colonnes : un arbre court n'aurait pas de
  // colonne pour les paliers des autres, et l'information serait perdue à l'écriture.
  let paliersReference: string[] = [];
  for (const arbre of arbresParBeneficiaire.values()) {
    const { paliers } = aplatirArbre(arbre);
    if (paliers.length > paliersReference.length) paliersReference = paliers;
  }

  const colonnes: ColonneFeuille[] = [
    { header: 'ID Transaction', key: 'transaction_id', width: 24 },
    { header: 'Date', key: 'created_at', width: 20 },
    { header: 'Date de paiement', key: 'paid_at', width: 20 },
    { header: 'Type', key: 'source', width: 14 },
    { header: 'Statut', key: 'payment_status', width: 12 },
    { header: 'Montant unitaire', key: 'amount_unit', width: 16 },
    { header: 'Quantité', key: 'quantity', width: 10 },
    { header: 'Montant total', key: 'total_amount', width: 16 },
    { header: 'Opérateur', key: 'provider', width: 14 },
    { header: "Motif d'échec", key: 'failure', width: 30 },
    // Payeur - identité seule, sans structure (cf. l'avertissement ci-dessus).
    { header: 'Payeur - Prénom', key: 'actor_firstname', width: 20 },
    { header: 'Payeur - Nom', key: 'actor_lastname', width: 20 },
    { header: 'Payeur - Téléphone', key: 'actor_phone', width: 16 },
    // Bénéficiaire - identité + structure de rattachement.
    { header: 'Bénéficiaire - Prénom', key: 'beneficiary_firstname', width: 20 },
    { header: 'Bénéficiaire - Nom', key: 'beneficiary_lastname', width: 20 },
    { header: 'Bénéficiaire - Téléphone', key: 'beneficiary_phone', width: 16 },
    { header: 'Bénéficiaire - Structure', key: 'beneficiary_structure', width: 28 },
    // Structure du bénéficiaire, un palier par colonne.
    ...paliersReference.map((palier, i) => ({
      header: `Bénéficiaire - ${palier || `Structure niveau ${i + 1}`}`,
      key: `beneficiary_structure_level_${i}`,
      width: 26,
    })),
  ];

  const lignes = paiements.map((p: any) => {
    const arbre = p.beneficiary?.uuid
      ? arbresParBeneficiaire.get(p.beneficiary.uuid)
      : null;
    const { structures } = arbre ? aplatirArbre(arbre) : { structures: [] as string[] };

    const ligne: Record<string, any> = {
      transaction_id: p.transaction_id ?? '',
      created_at: p.created_at ?? null,
      paid_at: p.paid_at ?? null,
      source: p.source ?? '',
      payment_status: LIBELLE_STATUT[p.payment_status] ?? p.payment_status ?? '',
      amount_unit: Number(p.amount ?? 0),
      quantity: Number(p.quantity ?? 0),
      total_amount: Number(p.total_amount ?? 0),
      provider: p.provider ?? '',
      /* Le motif ne s'affiche que sur un échec : sur un paiement crédité APRÈS une tentative
         ratée, `failure_code` peut encore traîner (cf. le correctif du 2026-08-20), et
         l'afficher ferait lire « payé » et « authentification refusée » sur la même ligne. */
      failure:
        p.payment_status === 'failed'
          ? p.failure_message ?? p.failure_code ?? 'motif non transmis'
          : '',
      actor_firstname: p.actor?.firstname ?? '',
      actor_lastname: p.actor?.lastname ?? '',
      actor_phone: p.actor?.phone ?? '',
      beneficiary_firstname: p.beneficiary?.firstname ?? '',
      beneficiary_lastname: p.beneficiary?.lastname ?? '',
      beneficiary_phone: p.beneficiary?.phone ?? '',
      beneficiary_structure: p.beneficiary?.structure?.name ?? '',
    };

    paliersReference.forEach((_, i) => {
      ligne[`beneficiary_structure_level_${i}`] = structures[i] ?? '';
    });

    return ligne;
  });

  return { colonnes, lignes };
}
