-- =====================================================================
-- SOKA — Ajout du « responsable de zone » sur journal_zones
-- Le fichier de recensement porte, au niveau zone (ligne SOUS-TOTAL),
-- un responsable (nom + téléphone) qui coordonne la distribution de
-- toutes les destinations de la zone. On le modélise comme un membre.
-- À exécuter une fois sur la base applicative (ex : soka_preprod_db).
-- =====================================================================

ALTER TABLE `journal_zones`
  ADD COLUMN `responsible_member_uuid` char(36)
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci DEFAULT NULL AFTER `structure_uuid`,
  ADD COLUMN `responsible_phone` varchar(30) DEFAULT NULL AFTER `responsible_member_uuid`,
  ADD COLUMN `responsible_phone_whatsapp` varchar(30) DEFAULT NULL AFTER `responsible_phone`,
  ADD KEY `IDX_journal_zones_responsible` (`responsible_member_uuid`);
