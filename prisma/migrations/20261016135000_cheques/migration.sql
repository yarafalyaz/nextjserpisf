-- Giro/cek (Accurate: "Giro Mundur") — register giro & cek dengan jatuh tempo.
--
-- Ditulis idempoten karena DB dev dibangun dengan `prisma db push`.

SET @tbl := (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'cheques');
SET @sql := IF(@tbl > 0, 'SELECT 1', '
CREATE TABLE `cheques` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `document_no` VARCHAR(191) NOT NULL,
  `type` VARCHAR(191) NOT NULL DEFAULT ''giro'',
  `direction` VARCHAR(191) NOT NULL DEFAULT ''in'',
  `number` VARCHAR(191) NULL,
  `account_id` INTEGER NULL,
  `party` VARCHAR(191) NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `due_date` DATETIME(3) NOT NULL,
  `status` VARCHAR(191) NOT NULL DEFAULT ''pending'',
  `notes` TEXT NULL,
  `created_by` INTEGER NULL,
  `deleted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `cheques_document_no_key`(`document_no`),
  INDEX `cheques_status_idx`(`status`),
  INDEX `cheques_due_date_idx`(`due_date`),
  INDEX `cheques_direction_idx`(`direction`),
  INDEX `cheques_created_by_idx`(`created_by`),
  INDEX `cheques_created_at_idx`(`created_at`),
  INDEX `cheques_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
