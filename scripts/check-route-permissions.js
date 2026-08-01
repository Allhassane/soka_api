#!/usr/bin/env node
/**
 * Garde-fou : échoue si une route HTTP n'est protégée ni par `@RequirePermissions`,
 * ni par une exemption EXPLICITE listée ci-dessous.
 *
 * Pourquoi ce script existe : le 2026-07-25, un codemod a posé 248 décorateurs mais a sauté
 * `POST /import/members` et `POST /journals/distributions/sweep` - donc protégé les lectures
 * en laissant ouvertes l'importation de masse et l'envoi de SMS de masse. Rien ne l'a détecté.
 * Une liste blanche explicite rend désormais tout oubli visible : ajouter une route sans
 * permission oblige à venir écrire ici POURQUOI elle est publique.
 *
 * Usage : node scripts/check-route-permissions.js   (code de sortie 1 si anomalie)
 */
const fs = require('fs');
const path = require('path');

/** Routes légitimement sans permission : `fichier:chemin` → justification. */
const EXEMPTIONS = {
  // Authentification : par définition accessible sans être authentifié.
  'auth/auth.controller.ts:login': 'connexion',
  'auth/auth.controller.ts:logout': 'déconnexion',
  'auth/auth.controller.ts:user': 'profil du porteur du token',
  'auth/auth.controller.ts:reset-password/:uuid': 'réinitialisation de mot de passe',
  'auth/auth.controller.ts:forgot-password': 'mot de passe oublié (self-service)',
  'auth/auth.controller.ts:resend-password': 'renvoi du mot de passe par SMS',
  // Webhooks : appelés par le prestataire de paiement, authentifiés par signature.
  'payments/cinetpay.controller.ts:callback': 'webhook CinetPay (signature)',
  'sokapay/sokapay.controller.ts:checkout': 'ouverture du guichet de paiement',
  'sokapay/sokapay.controller.ts:soka-pay/:uuid': 'suivi public d’une transaction',
  'donate-payment/donate-payment.controller.ts:hub/check/status/:transaction_id': 'webhook HUB2',
  'donate-payment/donate-payment.controller.ts:cinetpay/check/status/:transaction_id': 'webhook CinetPay',
  // Technique / diagnostic.
  'app.controller.ts:': 'racine de santé',
  'location/location.controller.ts:search': 'autocomplétion d’adresse (référentiel externe)',
  'tests/test.controller.ts:test-success': 'diagnostic',
  'tests/test.controller.ts:test-error': 'diagnostic',
};

const racine = path.join(__dirname, '..', 'src');
const fichiers = [];
(function parcourir(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) parcourir(p);
    else if (e.name.endsWith('.controller.ts')) fichiers.push(p);
  }
})(racine);

const anomalies = [];
const inertes = [];

for (const f of fichiers) {
  const rel = path.relative(racine, f).replace(/\\/g, '/');
  const contenu = fs.readFileSync(f, 'utf8');
  const lignes = contenu.split('\n');
  const guardClasse = /@UseGuards\([^)]*PermissionsGuard/.test(
    lignes.slice(0, 80).join('\n'),
  );

  for (let i = 0; i < lignes.length; i++) {
    const m = lignes[i].match(/^\s*@(Get|Post|Put|Patch|Delete)\((.*)\)/);
    if (!m) continue;

    // Ignorer ce qui est à l'intérieur d'un bloc commenté.
    const avant = lignes.slice(0, i).join('\n');
    if ((avant.match(/\/\*/g) || []).length > (avant.match(/\*\//g) || []).length) continue;

    const chemin = (m[2] || '').replace(/['"]/g, '').split(',')[0].trim();
    const cle = `${rel}:${chemin}`;

    /**
     * ⚠️ La fenêtre doit s'arrêter au décorateur de LA ROUTE SUIVANTE.
     *
     * La première version regardait `slice(i - 6, i + 8)` : une fenêtre fixe qui débordait sur
     * la route d'après. Toute route non protégée **immédiatement suivie** d'une route protégée
     * passait donc au vert - précisément le cas de `GET /comite/:uuid/members`, suivi de
     * `POST :uuid/members` qui, lui, porte un `@RequirePermissions`. Le garde-fou validait
     * exactement la classe de défaut qu'il devait attraper.
     *
     * On délimite maintenant le bloc de décorateurs de cette route : de la dernière ligne vide
     * ou accolade au-dessus, jusqu'au prochain décorateur de route en dessous.
     */
    let debut = i;
    while (
      debut > 0 &&
      /^\s*@/.test(lignes[debut - 1]) // on remonte tant qu'on est dans des décorateurs
    ) {
      debut--;
    }
    let fin = i + 1;
    while (
      fin < lignes.length &&
      !/^\s*@(Get|Post|Put|Patch|Delete)\(/.test(lignes[fin])
    ) {
      fin++;
    }
    const fenetre = lignes.slice(debut, fin).join('\n');
    const protegee = /@RequirePermissions\(/.test(fenetre);

    if (!protegee) {
      // `@Public()` est une exemption déjà déclarée DANS le code : on la respecte telle quelle
      // (le décorateur est lu par `PermissionsGuard`, ce n'est pas une simple annotation).
      // `@ReferentialRead()` = lecture de nomenclature ouverte à tout AUTHENTIFIÉ (JwtAuthGuard
      // conservé) : exemption déclarée dans le code, cf. auth/decorators/referential-read.decorator.ts.
      const estPublic = /@Public\(\)/.test(fenetre);
      const estReferentiel = /@ReferentialRead\(\)/.test(fenetre);
      if (!estPublic && !estReferentiel && !(cle in EXEMPTIONS)) {
        anomalies.push(`  ${m[1].padEnd(6)} ${chemin.padEnd(38)} ${rel}:${i + 1}`);
      }
      continue;
    }

    // Décorateur présent mais aucun PermissionsGuard : il ne sert à RIEN.
    if (!guardClasse && !/@UseGuards\([^)]*PermissionsGuard/.test(fenetre)) {
      inertes.push(`  ${m[1].padEnd(6)} ${chemin.padEnd(38)} ${rel}:${i + 1}`);
    }
  }
}

let echec = false;
if (anomalies.length) {
  echec = true;
  console.error(`\n❌ ${anomalies.length} route(s) sans permission et sans exemption déclarée :`);
  console.error(anomalies.join('\n'));
  console.error('\n→ Poser @RequirePermissions, ou déclarer la route dans EXEMPTIONS avec sa justification.');
}
if (inertes.length) {
  echec = true;
  console.error(`\n❌ ${inertes.length} route(s) avec @RequirePermissions mais SANS PermissionsGuard (décorateur inopérant) :`);
  console.error(inertes.join('\n'));
  console.error('\n→ Ajouter @UseGuards(JwtAuthGuard, PermissionsGuard) au niveau de la classe.');
}

if (!echec) {
  console.log(`✅ Toutes les routes sont protégées ou explicitement exemptées (${fichiers.length} contrôleurs).`);
}
process.exit(echec ? 1 : 0);
