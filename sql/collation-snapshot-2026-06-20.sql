-- Snapshot rollback collations (généré par fix-members-collation.js) - 2026-06-20T18:20:17.463Z
-- Réimporter ce fichier restaure les collations d'origine.
USE `soka_db`;

ALTER TABLE `members` MODIFY `civility_uuid` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL;
ALTER TABLE `members` MODIFY `marital_status_uuid` varchar(50) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL;
ALTER TABLE `members` MODIFY `country_uuid` char(36) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL;
ALTER TABLE `members` MODIFY `city_uuid` char(36) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL;
ALTER TABLE `members` MODIFY `formation_uuid` char(36) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL;
ALTER TABLE `members` MODIFY `job_uuid` char(36) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL;
ALTER TABLE `members` MODIFY `organisation_city_uuid` char(36) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL;
ALTER TABLE `members` MODIFY `department_uuid` char(36) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL;
ALTER TABLE `members` MODIFY `division_uuid` char(36) CHARACTER SET latin1 COLLATE latin1_swedish_ci NULL;
ALTER TABLE `civilities` MODIFY `uuid` char(36) CHARACTER SET latin1 COLLATE latin1_general_ci NOT NULL DEFAULT (uuid());
ALTER TABLE `marital_status` MODIFY `uuid` char(36) CHARACTER SET latin1 COLLATE latin1_general_ci NOT NULL DEFAULT (uuid());
ALTER TABLE `cities` MODIFY `uuid` char(36) CHARACTER SET latin1 COLLATE latin1_general_ci NOT NULL DEFAULT (uuid());
ALTER TABLE `formations` MODIFY `uuid` char(36) CHARACTER SET latin1 COLLATE latin1_general_ci NOT NULL DEFAULT (uuid());
ALTER TABLE `organisation_cities` MODIFY `uuid` char(36) CHARACTER SET latin1 COLLATE latin1_general_ci NOT NULL DEFAULT (uuid());
ALTER TABLE `member_accessories` MODIFY `member_uuid` varchar(255) CHARACTER SET latin1 COLLATE latin1_general_ci NOT NULL;
ALTER TABLE `member_responsibilities` MODIFY `member_uuid` varchar(36) CHARACTER SET latin1 COLLATE latin1_general_ci NULL;
