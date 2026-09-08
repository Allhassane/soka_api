#!/usr/bin/env bash
#
# Déploiement du 2026-09-08 - Transferts hors périmètre + matricules manquants.
#
# À lancer SUR LE SERVEUR, depuis api/, APRÈS les `git pull` de api/ et web/ :
#     bash scripts/deploy-2026-09-08.sh
#
# 🚨 CE QUI CHANGE PAR RAPPORT AUX DÉPLOIEMENTS PRÉCÉDENTS - À LIRE AVANT DE LANCER
#
# La migration `AddMembersMatriculeUniqueIndex` pose `UQ_members_matricule`, et elle **REFUSE
# de s'appliquer** tant que des matricules sont portés par plusieurs fiches. En local, 10 fiches
# étaient dans ce cas (une note de saisie mise à la place du matricule). **La production n'est
# pas rattrapée.**
#
# Conséquence sur l'ORDRE : le rattrapage des données (étape 3) passe **AVANT** les migrations
# (étape 4). C'est l'inverse de l'habitude - jusqu'ici les opérations de données venaient après
# le redémarrage. Si on garde l'ancien ordre :
#   - `npm run migration:run` s'arrête sur le refus (message explicite, rien n'est cassé) ;
#   - et surtout, comme `app.module.ts` porte **`migrationsRun: true` en production**, un simple
#     `pm2 restart` rejouerait la migration au démarrage : **l'API ne repartirait pas.**
#
# Le refus est délibéré : il vaut mieux un déploiement qui s'arrête proprement qu'une migration
# qui dédoublonne des données métier toute seule, au démarrage de l'API, sans relecture.
#
# Le script s'arrête à la première erreur (`set -e`), sauvegarde la base AVANT toute écriture,
# et toutes ses opérations de données sont idempotentes (le rejouer ne double rien).
#
# 🚨 Ce qu'il ne fait PAS, volontairement : aucun `git pull` (c'est à l'exploitant), et aucun
# arbitrage sur les matricules non conformes mais UNIQUES (`sss`, `XXXXX`, numéros de ligne) -
# ils ne bloquent aucune contrainte et relèvent d'une décision métier.

set -euo pipefail

API_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="${WEB_DIR:-$(cd "$API_DIR/../web" 2>/dev/null && pwd || echo '')}"
HORODATAGE="$(date +%Y-%m-%dT%H-%M-%S)"
JOURNAL="$API_DIR/backups/deploiement-$HORODATAGE.log"

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

MYSQL_ARGS=(-h "$DB_HOST" -u "$DB_USER")
if [ -n "$DB_PASS" ]; then
  MYSQL_ARGS+=("-p$DB_PASS")
fi

mysql "${MYSQL_ARGS[@]}" -e "SELECT 1" "$DB_NAME" >/dev/null \
  || { souci "Base « $DB_NAME » injoignable - rien n'est joué."; exit 1; }
ok "Base « $DB_NAME » joignable sur $DB_HOST"

# Le code doit être celui du déploiement : sans le seed, l'étape 3 n'a rien à lancer et la
# migration de l'étape 4 refusera. Mieux vaut le dire ici que de le découvrir au milieu.
[ -f src/seeds/seed-fix-missing-matricule.ts ] \
  || { souci "src/seeds/seed-fix-missing-matricule.ts absent - le « git pull » a-t-il été fait ?"; exit 1; }
ok "code du 2026-09-08 présent"

# État AVANT, pour pouvoir comparer à la fin.
titre "0 bis. État des matricules AVANT"
mysql "${MYSQL_ARGS[@]}" -t "$DB_NAME" -e "
SELECT COUNT(*) AS membres,
       SUM(TRIM(COALESCE(matricule,'')) = '') AS sans_matricule,
       SUM(matricule REGEXP '^[0-9]{2}-[0-9]{4,}\$') AS format_canonique
  FROM members;"
mysql "${MYSQL_ARGS[@]}" -t "$DB_NAME" -e "
SELECT matricule, COUNT(*) AS fiches
  FROM members
 WHERE TRIM(COALESCE(matricule,'')) <> ''
 GROUP BY matricule HAVING COUNT(*) > 1
 ORDER BY fiches DESC;"
echo "   (le tableau ci-dessus liste ce qui BLOQUE UQ_members_matricule ; vide = rien à libérer)"

# ─────────────────────────────────────────────────────────────────────────────
titre "1. Sauvegarde de la base"

SAUVEGARDE="$API_DIR/backups/base-avant-deploiement-$HORODATAGE.sql"
mysqldump "${MYSQL_ARGS[@]}" --single-transaction --no-tablespaces "$DB_NAME" > "$SAUVEGARDE"
ok "$(du -h "$SAUVEGARDE" | cut -f1) → $SAUVEGARDE"

# ─────────────────────────────────────────────────────────────────────────────
titre "2. API - dépendances et build"

# ⚠️ PAS de `--omit=dev` : `ts-node` et `tsconfig-paths` sont des devDependencies, et les
# migrations comme les seeds passent par elles. Les omettre casserait tout ce qui suit.
# ⚠️ Si `NODE_ENV=production` est posé dans l'environnement du shell, `npm ci` saute AUSSI les
# devDependencies sans le dire - d'où le contrôle explicite juste après.
npm ci
[ -d node_modules/ts-node ] \
  || { souci "ts-node absent après npm ci (NODE_ENV=production ?). Relancer : npm ci --include=dev"; exit 1; }
ok "dépendances installées (ts-node présent)"

npm run build
ok "build"

# ─────────────────────────────────────────────────────────────────────────────
titre "3. Rattrapage des matricules — AVANT les migrations"

# Simulation d'abord : elle produit le rapport Excel de CE QUI SERAIT FAIT, sans rien écrire.
# On la garde même en mode non supervisé, parce que c'est ce fichier qui permet de savoir
# après coup quelle fiche a reçu quel numéro, et quelle valeur elle portait avant.
npm run seed:fix-missing-matricule -- --liberer-doublons --dry-run
ok "simulation faite - relire l'Excel « matricules-a-attribuer-*.xlsx » en cas de doute"

# Écriture réelle. `--liberer-doublons` ne vise QUE les valeurs non plausibles portées par
# PLUSIEURS fiches (les seules qui empêchent la contrainte d'exister) ; une valeur non conforme
# mais unique reste intacte.
npm run seed:fix-missing-matricule -- --liberer-doublons --confirm
ok "matricules attribués"

RESTE_VIDE="$(mysql "${MYSQL_ARGS[@]}" -N -B "$DB_NAME" -e \
  "SELECT COUNT(*) FROM members WHERE TRIM(COALESCE(matricule,'')) = '';")"
RESTE_DOUBLONS="$(mysql "${MYSQL_ARGS[@]}" -N -B "$DB_NAME" -e \
  "SELECT COUNT(*) FROM (SELECT matricule FROM members
     WHERE TRIM(COALESCE(matricule,'')) <> '' GROUP BY matricule HAVING COUNT(*) > 1) d;")"

[ "$RESTE_DOUBLONS" = "0" ] \
  || { souci "$RESTE_DOUBLONS valeur(s) encore en doublon - la migration refuserait. Rien n'est migré."; exit 1; }
ok "0 doublon, 0 fiche sans matricule (restant sans matricule : $RESTE_VIDE)"

# ─────────────────────────────────────────────────────────────────────────────
titre "4. Migrations"

npm run migration:run
ok "migrations appliquées"

INDEX_OK="$(mysql "${MYSQL_ARGS[@]}" -N -B "$DB_NAME" -e \
  "SELECT COUNT(*) FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'members'
      AND index_name = 'UQ_members_matricule' AND non_unique = 0;")"
[ "$INDEX_OK" = "1" ] \
  && ok "UQ_members_matricule posé et UNIQUE" \
  || { souci "UQ_members_matricule absent - voir la sortie de migration ci-dessus."; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
titre "5. Droit requis par la nouvelle route de transfert"

# `GET /structure/transfer-targets` est sous `membres_initier_transfert`. Le droit existe depuis
# le 2026-07-22 et n'a besoin d'AUCUNE migration ici - mais s'il manquait en prod, la cascade
# resterait vide et on chercherait à nouveau du côté du périmètre.
DROIT="$(mysql "${MYSQL_ARGS[@]}" -N -B "$DB_NAME" -e \
  "SELECT COUNT(*) FROM roles_permissions rp
     JOIN permissions p ON p.uuid = rp.permission_uuid
    WHERE p.slug = 'membres_initier_transfert' AND rp.status = 1;")"
if [ "$DROIT" -ge 1 ]; then
  ok "membres_initier_transfert accordé à $DROIT rôle(s)"
else
  souci "membres_initier_transfert n'est accordé à AUCUN rôle : la cascade de destination"
  souci "restera vide. Lancer « npm run seed:permissions » puis revérifier."
fi

# ─────────────────────────────────────────────────────────────────────────────
titre "6. Redémarrage de l'API"

pm2 restart soka-api
sleep 5
pm2 describe soka-api | grep -qi "status.*online" \
  && ok "soka-api en ligne" \
  || { souci "soka-api n'est pas reparti - voir « pm2 logs soka-api »."; exit 1; }

# ─────────────────────────────────────────────────────────────────────────────
titre "7. Web - build et redémarrage"

if [ -n "$WEB_DIR" ] && [ -d "$WEB_DIR" ]; then
  # ⚠️ Ne jamais lancer ce build pendant qu'un `next dev` tourne sur le même dossier : les deux
  # écrivent dans `.next/` et le serveur se met à répondre 500 partout.
  ( cd "$WEB_DIR" && npm ci && npm run build )
  pm2 restart soka-admin
  sleep 5
  pm2 describe soka-admin | grep -qi "status.*online" \
    && ok "soka-admin en ligne" \
    || { souci "soka-admin n'est pas reparti - voir « pm2 logs soka-admin »."; exit 1; }
else
  saute "web - dossier introuvable (poser WEB_DIR=/chemin/vers/web)"
fi

# ─────────────────────────────────────────────────────────────────────────────
titre "8. Vérifications"

npm run check:permissions
ok "toutes les routes sont protégées ou exemptées"

mysql "${MYSQL_ARGS[@]}" -t "$DB_NAME" -e "
SELECT COUNT(*) AS membres,
       SUM(TRIM(COALESCE(matricule,'')) = '') AS sans_matricule,
       SUM(matricule REGEXP '^[0-9]{2}-[0-9]{4,}\$') AS format_canonique,
       COUNT(DISTINCT matricule) AS matricules_distincts
  FROM members;"

titre "Terminé"
echo "   Journal complet : $JOURNAL"
echo "   Sauvegarde      : $SAUVEGARDE"
echo "   Rapports Excel  : $API_DIR/matricules-*.xlsx"
echo "                     (ils portent des NOMS DE MEMBRES - ne pas les diffuser ;"
echo "                      ils sont dans le .gitignore depuis ce déploiement)"
echo
echo "   Recette à faire À LA MAIN, avec un compte RESPONSABLE (surtout pas admin :"
echo "   la barrière de périmètre est court-circuitée pour is_admin, le défaut était"
echo "   invisible en admin) :"
echo "     • Membres → Transferts → « Nouvelle demande » ;"
echo "     • choisir une région AUTRE que la sienne : les menus « Centre régional »,"
echo "       « Centre », « Chapitre » et « District » doivent se remplir ;"
echo "     • vérifier qu'une fiche membre récemment importée affiche bien un matricule."
