import * as fs from 'fs';
import * as path from 'path';

/**
 * Relevé des slugs de permission RÉELLEMENT exigés par le code, par lecture des sources.
 *
 * Sert de garde-fou au seed du catalogue : un slug exigé par une route (ou par un composant du
 * front) mais absent de la table `permissions` est **refusé pour tout le monde sauf `is_admin`**
 * (cf. `PermissionsGuard`, api/CLAUDE.md). Autrement dit, oublier un slug ne casse pas la
 * compilation - ça ferme silencieusement une fonctionnalité. D'où ce scan.
 *
 * Lecture purement textuelle (pas d'AST) : suffisant pour les formes utilisées dans le dépôt, et
 * sans dépendance. Deux limites connues, sans conséquence puisque le résultat n'est qu'un
 * avertissement : le code en commentaire et les exemples de JSDoc sont comptés comme des usages.
 */

export interface SlugUsage {
  slug: string;
  /** Fichiers (chemins relatifs) où le slug est exigé. */
  files: string[];
}

const IGNORES = new Set(['node_modules', 'dist', '.next', '.git', 'coverage']);

function walk(
  dir: string,
  garde: (nom: string) => boolean,
  acc: string[] = [],
): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORES.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, garde, acc);
    else if (garde(e.name)) acc.push(p);
  }
  return acc;
}

function ajouter(
  map: Map<string, Set<string>>,
  slug: string,
  fichier: string,
): void {
  if (!map.has(slug)) map.set(slug, new Set());
  map.get(slug)!.add(fichier);
}

function trier(map: Map<string, Set<string>>): SlugUsage[] {
  return [...map.entries()]
    .map(([slug, files]) => ({ slug, files: [...files].sort() }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * Slugs exigés côté API par `@RequirePermissions`, littéraux ou passés par constante
 * (`@RequirePermissions(MANAGE_COMMITTEE_MEMBERS)`), auquel cas la constante est résolue.
 */
export function listEnforcedApiSlugs(srcDir: string): SlugUsage[] {
  const constantes = new Map<string, string>();
  for (const f of walk(srcDir, (n) => n.endsWith('.ts'))) {
    const src = fs.readFileSync(f, 'utf8');
    const re =
      /(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::\s*string\s*)?=\s*'([a-z0-9_]+)'/g;
    for (const m of src.matchAll(re)) constantes.set(m[1], m[2]);
  }

  const usages = new Map<string, Set<string>>();
  for (const f of walk(srcDir, (n) => n.endsWith('.controller.ts'))) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(srcDir, f).replace(/\\/g, '/');
    for (const m of src.matchAll(/@RequirePermissions\(\s*'([a-z0-9_]+)'/g)) {
      ajouter(usages, m[1], rel);
    }
    for (const m of src.matchAll(
      /@RequirePermissions\(\s*([A-Z][A-Z0-9_]*)\s*\)/g,
    )) {
      const slug = constantes.get(m[1]);
      if (slug) ajouter(usages, slug, rel);
    }
  }
  return trier(usages);
}

/**
 * Slugs exigés côté front : `<Protected permission="…">`, `hasPermission('…')` et l'entrée
 * `permission:` de `config/menus.ts`. Renvoie [] si le dossier n'existe pas (dépôts séparés).
 */
export function listWebPermissionSlugs(webDir: string): SlugUsage[] {
  const usages = new Map<string, Set<string>>();
  for (const f of walk(webDir, (n) => /\.(tsx?|jsx?)$/.test(n))) {
    const src = fs.readFileSync(f, 'utf8');
    const rel = path.relative(webDir, f).replace(/\\/g, '/');
    const motifs = [
      /permission=\{?\s*["']([a-z0-9_]+)["']/g,
      /has(?:Any|All)?Permissions?\(\s*\[?\s*["']([a-z0-9_]+)["']/g,
      /permission:\s*["']([a-z0-9_]+)["']/g,
    ];
    for (const re of motifs) {
      for (const m of src.matchAll(re)) ajouter(usages, m[1], rel);
    }
    // Forme ternaire : permission={isEditing ? "a" : "b"}
    for (const m of src.matchAll(
      /permission=\{[^}]*\?\s*["']([a-z0-9_]+)["']\s*:\s*["']([a-z0-9_]+)["']/g,
    )) {
      ajouter(usages, m[1], rel);
      ajouter(usages, m[2], rel);
    }
  }
  return trier(usages);
}
