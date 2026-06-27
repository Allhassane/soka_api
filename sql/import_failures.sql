-- Table des lignes d'échec d'import (synchronize OFF → création manuelle).
-- Idempotent. Dédoublonnage par `dedup_key` (matricule | tel:<num> | nom:<...>).
-- `batch_uuid` (ajout 2026-06-21) : dernier « fichier chargé » (import_batches.uuid) ayant signalé
-- l'échec - permet de regrouper/exporter les erreurs par fichier. Pour une base EXISTANTE, la colonne
-- est ajoutée par `scripts/setup-import-batches.js` (idempotent).
CREATE TABLE IF NOT EXISTS `import_failures` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `uuid` CHAR(36) NOT NULL,
  `dedup_key` VARCHAR(191) NOT NULL,
  `batch_uuid` VARCHAR(36) NULL,
  `line_number` INT NULL,
  `fullname` VARCHAR(191) NULL,
  `reason` TEXT NULL,
  `raw_data` JSON NULL,
  `admin_uuid` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_import_failures_uuid` (`uuid`),
  UNIQUE KEY `uq_import_failures_dedup` (`dedup_key`),
  KEY `idx_import_failures_batch` (`batch_uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
