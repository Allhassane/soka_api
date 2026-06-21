/**
 * Constantes du format canonique d'import des membres.
 * CANON doit correspondre exactement à `exemple_fichier_importation.xlsx` (feuille « Membres »).
 */

/** 51 colonnes canoniques, dans l'ordre. */
export const CANON: string[] = [
  'Matricule', 'Nom', 'Prénom', 'Genre', 'Date de naissance', 'Lieu de naissance',
  'Civilité', 'Situation matrimoniale', 'Nom du conjoint', 'Membre de la famille',
  "Nombre d'enfants", 'Pays', 'Ville', 'Formation', 'Profession', 'Téléphone',
  'WhatsApp', 'Nom du tuteur', 'Téléphone du tuteur', "Ville de l'organisation",
  'Voyages', 'Email', 'Département', 'Division', 'Gohonzon', 'Date adhésion',
  'Sokahan Byakuren', 'Tokusso', 'Date Tokusso', 'Omamori', 'Date Omamori',
  'Responsabilités', 'Longitude', 'Latitude', 'Bac à encens', 'Bougeoires',
  'Bougies Electriques', 'Butsudan', 'Coupe à eau', 'Coupe de riz', 'Gong',
  'Grues', 'Juzu', 'Kyobon', 'REGION', 'CENTRE REGIONAL ', 'CENTRE', 'CHAPITRE',
  'DISTRICT', 'GROUPE', 'SOUS_GROUPE',
];

/**
 * Colonnes dont la valeur doit être renseignée (non vide) pour qu'une ligne soit valide.
 * = champs obligatoires du formulaire de création QUI existent dans le format canonique
 * et se mappent à une colonne de l'entité Member. (Le téléphone - 10 chiffres - est
 * contrôlé séparément ; la structure est contrôlée par la résolution hiérarchique.)
 */
export const IMPORT_REQUIRED_COLUMNS: string[] = [
  'Nom', 'Prénom', 'Genre', 'Date de naissance', 'Lieu de naissance',
  'Situation matrimoniale', "Nombre d'enfants", 'Pays', 'Ville', 'Profession',
  'Nom du tuteur', 'Téléphone du tuteur', 'Date adhésion', 'CENTRE', 'CHAPITRE',
];

/**
 * Niveaux de structure résolus, du plus général (ancre) au plus spécifique.
 * REGION et CENTRE REGIONAL sont volontairement exclus : leurs valeurs côté formatage
 * ne correspondent pas aux noms en base ; la chaîne CENTRE→…→SOUS_GROUPE suffit et est fiable.
 */
export const STRUCTURE_LEVELS_DOWN: string[] = [
  'CENTRE', 'CHAPITRE', 'DISTRICT', 'GROUPE', 'SOUS_GROUPE',
];

/** Alias de civilité (valeur normalisée du fichier → nom canonique en base). */
export const CIVILITY_ALIASES: Record<string, string> = {
  M: 'Monsieur',
  MR: 'Monsieur',
  MONSIEUR: 'Monsieur',
  MME: 'Madame',
  MADAME: 'Madame',
  MLLE: 'Mademoiselle',
  MADEMOISELLE: 'Mademoiselle',
};
