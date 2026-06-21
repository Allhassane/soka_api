-- SOKA - Correctifs de schéma appliqués le 2026-06-13 (base de dev `soka_db`, MySQL 8)
--
-- Contexte : la base est en migration Laravel -> NestJS INACHEVÉE. Plusieurs tables
-- divergent des entités TypeORM (le `synchronize` qui devait compléter le schéma avait
-- crashé sur l'erreur binlog "Statement is unsafe ... UUID()").
--
-- Ci-dessous les colonnes `deleted_at` (soft-delete) ajoutées pour aligner PARTIELLEMENT
-- le schéma sur les entités (sans elles, les requêtes `... WHERE deleted_at IS NULL` plantent).

ALTER TABLE members     ADD COLUMN deleted_at datetime(6) NULL DEFAULT NULL;
ALTER TABLE structures  ADD COLUMN deleted_at datetime(6) NULL DEFAULT NULL;
ALTER TABLE departments ADD COLUMN deleted_at datetime(6) NULL DEFAULT NULL;
ALTER TABLE divisions   ADD COLUMN deleted_at datetime(6) NULL DEFAULT NULL;

-- ⚠⚠ INSUFFISANT - bloquant n°1 du projet :
-- La table `members` réelle n'a que ~13 colonnes (id, uuid, picture, structure_uuid,
-- matricule, gender, birth_date, birth_city, email, sokahan_byakuren, created_at,
-- updated_at, deleted_at) alors que `MemberEntity` en attend ~50 : il MANQUE notamment
-- firstname, lastname, phone, phone_whatsapp, civility_uuid, marital_status_uuid,
-- country_uuid, city_uuid, department_uuid, division_uuid, formation_uuid, job_uuid,
-- membership_date, has_gohonzon/date_gohonzon, has_tokusso, has_omamori, etc.
-- => `GET /members` et la plupart des fonctionnalités membres renvoient 500.
--
-- Une RECONCILIATION COMPLÈTE du schéma (chantier "finalisation de la migration") est
-- nécessaire : reconstruire `members` (et vérifier `structures`, `roles`, etc.) pour
-- correspondre aux entités, puis migrer les données héritées. À faire via de vraies
-- migrations TypeORM versionnées, pas via `synchronize`.
