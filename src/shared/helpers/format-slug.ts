export function formatSlug(moduleName: string, permissionName: string): string {
  const str = `${moduleName} ${permissionName}`;
  return str
    .toLowerCase()
    .normalize('NFKD') // enlever accents
    .replace(/[\u0300-\u036F]/g, '') // enlever diacritiques
    .replace(/[^a-z0-9]+/g, '_') // remplacer les espaces et caractères spéciaux par _
    .replace(/^_+|_+$/g, ''); // supprimer _ au début et fin
}
