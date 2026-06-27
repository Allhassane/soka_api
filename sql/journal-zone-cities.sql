-- =====================================================================
-- SOKA — Table de liaison Zone ↔ Villes (cities) du module Journal
-- Une zone de distribution regroupe plusieurs villes du référentiel `cities`.
-- Sert de base au rattachement abonné → zone via members.city_uuid.
-- Idempotent. utf8mb4_unicode_ci (cohérent avec journal_zones.uuid).
-- À exécuter sur la base applicative (ex : soka_preprod_db).
-- =====================================================================

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `journal_zone_cities` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT (uuid()),
  `zone_uuid` char(36) NOT NULL,
  `city_uuid` char(36) NOT NULL,
  `admin_uuid` char(36) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_journal_zone_cities_uuid` (`uuid`),
  KEY `IDX_jzc_zone` (`zone_uuid`),
  KEY `IDX_jzc_city` (`city_uuid`),
  UNIQUE KEY `UQ_jzc_zone_city` (`zone_uuid`,`city_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
