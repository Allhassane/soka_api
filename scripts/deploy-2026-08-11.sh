#!/usr/bin/env bash
#
# Déploiement du 2026-08-11 - Module Comptabilité, identité HUB2, rapatriements.
#
# À lancer SUR LE SERVEUR, depuis api/, APRÈS les `git pull` de api/ et web/ :
#     bash scripts/deploy-2026-08-11.sh
#
# Ce script est conçu pour être joué sans supervision :
#   - il s'arrête à la première erreur (`set -e`) ; rien ne s'enchaîne sur un échec ;
#   - il sauvegarde la base AVANT toute migration ou écriture ;
#   - les étapes qui dépendent de la gateway sont SAUTÉES proprement si la clé n'y est pas
#     valide (elles ne font pas échouer le déploiement : le module s'installe quand même) ;
#   - toutes les opérations de données sont IDEMPOTENTES : le rejouer ne double rien.
#
# 🚨 Ce qu'il ne fait PAS, volontairement : aucun `git pull` (c'est à l'exploitant), aucune
# suppression de permission (le seed refuse désormais d'en supprimer sans `--allow-deletions`),
# aucun crédit de paiement à la main (c'est le cron, par le chemin déjà éprouvé).

set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${WEB_DIR:-$(cd "$API_DIR/../web" 2>/dev/null && pwd || echo '')}"
HORODATAGE="$(date +%Y-%m-%dT%H-%M-%S)"
JOURNAL="$API_DIR/backups/deploiement-$HORODATAGE.log"
DUMP_SCHEMA="${DUMP_SCHEMA:-soka_dump0108}"

mkdir -p "$API_DIR/backups"
exec > >(tee -a "$JOURNAL") 2>&1

titre() { printf '\n\033[1m── %s ─────────────────────────────────────\033[0m\n' "$1"; }
ok()    { printf '   \033[32m✓\033[0m %s\n' "$1"; }
saute() { printf '   \033[33m⤼ SAUTÉ\033[0m %s\n' "$1"; }
souci() { printf '   \033[31m✗\033[0m %s\n' "$1"; }

cd "$API_DIR"

# ─────────────────────────────────────────────────────────────────────────────
titre "0. Contrôles préalables"

[ -f .env ] || { souci "api/.env introuvable - rien n'est joué."; exit 1; }

lire_env() { grep -E "^$1=" .env | head -1 | cut -d= -f2- | sed 's/^"//; s/"$//; s/\r$//'; }
DB_HOST="$(lire_env DB_HOST)"; DB_HOST="${DB_HOST:-localhost}"
DB_USER="$(lire_env DB_USER)"
DB_PASS="$(lire_env DB_PASSWORD)"
DB_NAME="$(lire_env DB_NAME)"
[ -n "$DB_NAME" ] || { souci "DB_NAME absent de api/.env - rien n'est joué."; exit 1; }

# Un seul point de construction des identifiants : `-p` sans valeur ouvre un prompt et
# ferait pendre un déploiement non supervisé.
MYSQL_ARGS=(-h "$DB_HOST" -u "$DB_USER")
# ⚠️ `if` et non `[ … ] && …` : sous `set -e`, un test qui échoue en fin de liste `&&` fait
# SORTIR le script. Avec un mot de passe vide, le déploiement s'arrêtait ici sans un mot.
if [ -n "$DB_PASS" ]; then
  MYSQL_ARGS+=("-p$DB_PASS")
fi

mysql "${MYSQL_ARGS[@]}" -e "SELECT 1" "$DB_NAME" >/dev/null \
  || { souci "Base « $DB_NAME » injoignable - rien n'est joué."; exit 1; }
ok "Base « $DB_NAME » joignable sur $DB_HOST"
ok "Journal de ce déploiement : $JOURNAL"

# ─────────────────────────────────────────────────────────────────────────────
titre "1. Sauvegarde de la base"

SAUVEGARDE="$API_DIR/backups/base-avant-deploiement-$HORODATAGE.sql"
mysqldump "${MYSQL_ARGS[@]}" --single-transaction --no-tablespaces "$DB_NAME" > "$SAUVEGARDE"
ok "$(du -h "$SAUVEGARDE" | cut -f1) → $SAUVEGARDE"

# ─────────────────────────────────────────────────────────────────────────────
titre "2. API - dépendances, build, migrations"

# ⚠️ PAS de `--omit=dev` : `ts-node` et `tsconfig-paths` sont des devDependencies, et les
# migrations comme les seeds passent par elles. Les omettre casserait tout ce qui suit.
npm ci
ok "dépendances installées"
npm run build
ok "build"

npm run migration:run
ok "migrations appliquées"

# ─────────────────────────────────────────────────────────────────────────────
titre "3. Permissions"

# Le seed refuse d'écrire s'il devait SUPPRIMER une permission (garde-fou du 2026-08-11) :
# une suppression emporte les liens de rôles, donc des droits, sans que rien le signale.
npm run seed:permissions
ok "catalogue synchronisé (comptabilite_voir_menu_comptabilite créé)"

# ─────────────────────────────────────────────────────────────────────────────
titre "4. Redémarrage de l'API"

pm2 restart soka-api
sleep 5
pm2 describe soka-api | grep -qi "status.*online" \
  && ok "soka-api en ligne" \
  || { souci "soka-api n'est pas reparti - voir « pm2 logs soka-api »."; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
titre "5. La gateway répond-elle à notre clé ?"

RACINE="$(lire_env HUB_API_URL | sed 's#/payment-links/*$##')"
CLE="$(lire_env HUB_API_KEY)"
GATEWAY_OK=0

if [ -z "$RACINE" ] || [ -z "$CLE" ]; then
  saute "HUB_API_URL ou HUB_API_KEY absent de api/.env"
else
  # `|| true` et non `|| echo 000` : en cas d'échec, curl a DÉJÀ écrit « 000 », et le echo
  # concaténait un second, donnant « 000000 ».
  CODE="$(curl -s -o /dev/null -m 20 -w '%{http_code}' \
            -H "Authorization: Bearer $CLE" "$RACINE/payments?page=1&perPage=1" || true)"
  if [ "$CODE" = "200" ]; then
    GATEWAY_OK=1
    ok "gateway joignable et clé acceptée (200)"
  else
    saute "la gateway répond $CODE - les étapes 6b, 6c et 6d seront sautées"
    souci "La clé de l'API n'est pas une clé marchande valide sur cette gateway."
    souci "Créer une clé sk_live_ puis relancer ce script : il reprendra où il en est."
  fi
fi

# ─────────────────────────────────────────────────────────────────────────────
titre "6. Opérations sur les données"

echo
echo "6a. Rapatriement des abonnements des campagnes parallèles"
npm run seed:merge-subscription-campaigns                 # simulation, pour le journal
npm run seed:merge-subscription-campaigns -- --apply
ok "campagnes parallèles rapatriées"

echo
echo "6b. Restauration des paiements supprimés"
if [ "$GATEWAY_OK" -eq 0 ]; then
  saute "6b - la gateway est inaccessible, impossible de savoir ce qui a été encaissé"
elif ! mysql "${MYSQL_ARGS[@]}" -N -e \
        "SELECT COUNT(*) FROM information_schema.TABLES
          WHERE TABLE_SCHEMA='$DUMP_SCHEMA'
            AND TABLE_NAME IN ('payments','subscription_payments','subscriptions')" \
        | grep -q '^3$'; then
  saute "6b - le schéma « $DUMP_SCHEMA » n'a pas les 3 tables du dump du 01/08"
  echo "        Charger le dump puis relancer ce script :"
  echo "          mysql -u… -p -e \"CREATE DATABASE IF NOT EXISTS $DUMP_SCHEMA\""
  echo "          mysql -u… -p $DUMP_SCHEMA < soka_app_01_08_2026.sql"
else
  npm run seed:restore-deleted-payments -- --source="$DUMP_SCHEMA"
  npm run seed:restore-deleted-payments -- --source="$DUMP_SCHEMA" --apply
  ok "paiements supprimés restaurés"

  echo
  echo "6c. Crédit des paiements restaurés (par le cron, jamais à la main)"
  npm run seed:sync-hub-payments
  ok "synchronisation jouée"
fi

echo
echo "6d. Rattrapage de l'identité HUB2"
if [ "$GATEWAY_OK" -eq 0 ]; then
  saute "6d - la gateway est inaccessible"
else
  # Après 6b, pour que les paiements restaurés soient inclus : sinon il faudrait un second
  # balayage complet du guichet. Pas de simulation ici - elle coûterait autant d'appels
  # réseau que l'écriture, et l'opération est purement additive (`updated_at` préservée).
  npm run seed:backfill-hub-details -- --apply
  ok "identité HUB2 rattrapée"
fi

# ─────────────────────────────────────────────────────────────────────────────
titre "7. Web - build et redémarrage"

if [ -z "$WEB_DIR" ] || [ ! -f "$WEB_DIR/package.json" ]; then
  saute "7 - dossier web introuvable (le préciser avec WEB_DIR=/chemin/vers/web)"
else
  ( cd "$WEB_DIR" && npm ci && npm run build )
  pm2 restart soka-admin
  ok "soka-admin redémarré"
fi

# ─────────────────────────────────────────────────────────────────────────────
titre "8. Vérifications"

npm run check:permissions
ok "toutes les routes sont protégées"

# Sonde en LECTURE STRICTE : code de sortie 1 s'il reste un encaissement non crédité.
if [ "$GATEWAY_OK" -eq 1 ]; then
  if npm run seed:reconcile-hub-payments; then
    ok "aucun encaissement non crédité"
  else
    souci "des encaissements ne sont pas crédités - voir la liste ci-dessus."
    souci "Le déploiement est en place ; c'est un constat, pas un échec de déploiement."
  fi
else
  saute "sonde de réconciliation - la gateway est inaccessible"
fi

mysql "${MYSQL_ARGS[@]}" -t "$DB_NAME" -e "
SELECT COUNT(*) AS paiements,
       SUM(payment_status='paid') AS payes,
       SUM(CASE WHEN payment_status='paid' THEN total_amount ELSE 0 END) AS encaisse,
       SUM(hub_payment_id IS NOT NULL) AS avec_identite_hub2
  FROM payments;"

titre "Terminé"
echo "   Journal complet : $JOURNAL"
echo "   Sauvegarde      : $SAUVEGARDE"
echo "   Retours arrière : $API_DIR/backups/rollback-*.sql"
echo
echo "   Il reste à faire À LA MAIN, depuis l'écran Comptabilité → Concordance HUB2 :"
echo "     • cliquer « Rafraîchir (guichet) » pour le premier instantané ;"
echo "     • se RECONNECTER pour voir l'entrée de menu (les droits d'affichage"
echo "       sont chargés au login, pas rafraîchis à chaud)."
# ⚠️ `if` et non `[ … ] && echo` : sous `set -e`, ce test échouant (gateway OK) faisait sortir
# le script en code non nul juste avant le `exit 0` - un déploiement réussi passait pour un échec.
if [ "$GATEWAY_OK" -eq 0 ]; then
  echo "   ⚠️  Étapes 6b/6c/6d NON jouées : clé de gateway à régler, puis relancer ce script."
fi
exit 0
