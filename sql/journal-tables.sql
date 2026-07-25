-- =====================================================================
-- SOKA - Création des tables du module Journal
-- Conforme aux entités NestJS (src/journals/entities/*).
-- Idempotent (CREATE TABLE IF NOT EXISTS). Collation utf8mb4_unicode_ci
-- pour des jointures propres avec members.uuid / structures.uuid /
-- subscriptions.uuid (déjà alignés en utf8mb4_unicode_ci).
-- À exécuter sur la base applicative (ex : soka_preprod_db).
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- journal_zones
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `journal_zones` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT (uuid()),
  `number` int NOT NULL,
  `name` varchar(191) NOT NULL,
  `structure_uuid` char(36) DEFAULT NULL,
  `history` longtext DEFAULT NULL,
  `admin_uuid` char(36) NOT NULL,
  `status` enum('created','started','stopped','canceled','completed','deleted','archived','pending','init','success','accepted','fail') NOT NULL DEFAULT 'created',
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_journal_zones_uuid` (`uuid`),
  KEY `IDX_journal_zones_number` (`number`),
  KEY `IDX_journal_zones_structure` (`structure_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- journal_destinations
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `journal_destinations` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT (uuid()),
  `zone_uuid` char(36) NOT NULL,
  `name` varchar(191) NOT NULL,
  `ville` varchar(191) DEFAULT NULL,
  `quartier` varchar(191) DEFAULT NULL,
  `correspondent_member_uuid` char(36) DEFAULT NULL,
  `correspondent_phone` varchar(30) DEFAULT NULL,
  `correspondent_phone_whatsapp` varchar(30) DEFAULT NULL,
  `nvx_id` int NOT NULL DEFAULT 0,
  `abonnes_12_mois` int NOT NULL DEFAULT 0,
  `total_abonnes` int NOT NULL DEFAULT 0,
  `history` longtext DEFAULT NULL,
  `admin_uuid` char(36) NOT NULL,
  `status` enum('created','started','stopped','canceled','completed','deleted','archived','pending','init','success','accepted','fail') NOT NULL DEFAULT 'created',
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_journal_destinations_uuid` (`uuid`),
  KEY `IDX_journal_destinations_zone` (`zone_uuid`),
  KEY `IDX_journal_destinations_correspondent` (`correspondent_member_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- journal_editions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `journal_editions` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT (uuid()),
  `number` int NOT NULL,
  `title` varchar(191) NOT NULL,
  `month` int NOT NULL,
  `year` int NOT NULL,
  `subscription_uuid` char(36) DEFAULT NULL,
  `distribution_start_at` datetime NOT NULL,
  `distribution_deadline_at` datetime NOT NULL,
  `total_printed` int NOT NULL DEFAULT 0,
  `history` longtext DEFAULT NULL,
  `admin_uuid` char(36) NOT NULL,
  `status` enum('created','started','stopped','canceled','completed','deleted','archived','pending','init','success','accepted','fail') NOT NULL DEFAULT 'created',
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_journal_editions_uuid` (`uuid`),
  KEY `IDX_journal_editions_number` (`number`),
  KEY `IDX_journal_editions_subscription` (`subscription_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- journal_distributions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `journal_distributions` (
  `created_at` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updated_at` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `deleted_at` datetime(6) DEFAULT NULL,
  `id` int NOT NULL AUTO_INCREMENT,
  `uuid` char(36) NOT NULL DEFAULT (uuid()),
  `edition_uuid` char(36) NOT NULL,
  `destination_uuid` char(36) NOT NULL,
  `expected_quantity` int NOT NULL DEFAULT 0,
  `sent_quantity` int NOT NULL DEFAULT 0,
  `delivered_quantity` int NOT NULL DEFAULT 0,
  `status` enum('pending','notified','in_progress','delivered','late','canceled') NOT NULL DEFAULT 'pending',
  `channel` enum('sms','whatsapp') NOT NULL DEFAULT 'sms',
  `notified_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `delivered_at` datetime DEFAULT NULL,
  `last_message` text DEFAULT NULL,
  `retry_count` int NOT NULL DEFAULT 0,
  `history` longtext DEFAULT NULL,
  `admin_uuid` char(36) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_journal_distributions_uuid` (`uuid`),
  KEY `IDX_journal_distributions_edition` (`edition_uuid`),
  KEY `IDX_journal_distributions_destination` (`destination_uuid`),
  UNIQUE KEY `UQ_journal_distributions_edition_destination` (`edition_uuid`,`destination_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
