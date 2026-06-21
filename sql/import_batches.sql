-- Table des « fichiers chargés » d'import (un enregistrement par commit). synchronize OFF → DDL manuel.
-- Idempotent. Les lignes en échec (import_failures.batch_uuid) pointent vers le DERNIER batch
-- les ayant signalées (le dédoublonnage des échecs reste global). uuid généré côté code (@BeforeInsert).
CREATE TABLE IF NOT EXISTS `import_batches` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `uuid` CHAR(36) NOT NULL,
  `file_name` VARCHAR(255) NULL,
  `total_rows` INT NOT NULL DEFAULT 0,
  `created_count` INT NOT NULL DEFAULT 0,
  `updated_count` INT NOT NULL DEFAULT 0,
  `failed_count` INT NOT NULL DEFAULT 0,
  `admin_uuid` VARCHAR(36) NULL,
  `created_at` DATETIME(6) NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_import_batches_uuid` (`uuid`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
