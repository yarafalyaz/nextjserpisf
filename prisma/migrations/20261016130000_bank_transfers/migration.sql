-- Transfer antar rekening kas/bank (Accurate: "Transfer Bank").
--
-- Ditulis idempoten karena DB dev dibangun dengan `prisma db push`.

SET @tbl := (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bank_transfers');
SET @sql := IF(@tbl > 0, 'SELECT 1', '
CREATE TABLE `bank_transfers` (
  `slug` VARCHAR(191) NULL,
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `document_no` VARCHAR(191) NOT NULL,
  `date` DATETIME(3) NOT NULL,
  `from_account_id` INTEGER NOT NULL,
  `to_account_id` INTEGER NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `admin_fee` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  `fee_account_id` INTEGER NULL,
  `description` TEXT NULL,
  `journal_id` INTEGER NULL,
  `created_by` INTEGER NULL,
  `deleted_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `bank_transfers_slug_key`(`slug`),
  UNIQUE INDEX `bank_transfers_document_no_key`(`document_no`),
  INDEX `bank_transfers_from_account_id_idx`(`from_account_id`),
  INDEX `bank_transfers_to_account_id_idx`(`to_account_id`),
  INDEX `bank_transfers_date_idx`(`date`),
  INDEX `bank_transfers_created_by_idx`(`created_by`),
  INDEX `bank_transfers_created_at_idx`(`created_at`),
  INDEX `bank_transfers_deleted_at_idx`(`deleted_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
