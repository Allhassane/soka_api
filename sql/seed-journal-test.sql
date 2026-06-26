-- =====================================================================
-- SOKA — Seed de test du workflow journal (à exécuter sur soka_preprod_db)
-- But : pouvoir tester la dérivation "besoin par zone" depuis les abonnements.
--  - rattache 5 membres à la ville YOPOUGON TOIT ROUGE (donc à ZONE 1) ;
--  - clôture une campagne d'abonnement (statut 'completed') ;
--  - crée 1 paiement payé (status 'success', quantité 1) par membre.
-- Résultat attendu : pour une édition liée à cette campagne,
--   /journals/editions/:uuid/needs-by-zone => ZONE 1 : 5 (total 5).
-- =====================================================================

-- Ville de rattachement (doit faire partie des "villes desservies" de ZONE 1)
SET @city := (SELECT uuid FROM cities WHERE name = 'YOPOUGON TOIT ROUGE' LIMIT 1);

-- Campagne d'abonnement à clôturer (la plus récente)
SET @sub := (SELECT uuid FROM subscriptions ORDER BY id DESC LIMIT 1);

-- 1) Rattacher 5 membres à cette ville (-> ZONE 1 via le mapping zone↔villes)
UPDATE members
SET city_uuid = @city
WHERE uuid IN (SELECT uuid FROM (SELECT uuid FROM members ORDER BY id LIMIT 5) t);

-- 2) Clôturer la campagne (=> éligible pour créer une édition)
UPDATE subscriptions SET status = 'completed' WHERE uuid = @sub;

-- 3) Un paiement payé (success), quantité 1, par membre rattaché
INSERT INTO subscription_payments
  (uuid, amount, quantity, subscription_uuid, beneficiary_uuid, beneficiary_name,
   actor_uuid, actor_name, payment_uuid, status, created_at, updated_at)
SELECT
  UUID(), 1000, 1, @sub, m.uuid,
  TRIM(CONCAT(COALESCE(m.lastname, ''), ' ', COALESCE(m.firstname, ''))),
  m.uuid, 'SEED-TEST', UUID(), 'success', NOW(), NOW()
FROM (SELECT uuid, firstname, lastname FROM members ORDER BY id LIMIT 5) m;
