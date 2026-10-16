-- Penyetoran pajak (PPh) ke kas negara: dokumen + jurnal Dr utang pajak / Cr kas-bank.
--
-- Idempoten (dijaga information_schema): tabel dev dibuat lewat `prisma db push`.

SET @tabel := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'tax_payments');

SET @sql := IF(@tabel = 0,
  'CREATE TABLE `tax_payments` (
    `slug` VARCHAR(191) NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_no` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `period` VARCHAR(191) NULL,
    `tax_type_id` INTEGER NULL,
    `tax_account_id` INTEGER NOT NULL,
    `payment_account_id` INTEGER NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `reference` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT ''posted'',
    `journal_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    UNIQUE INDEX `tax_payments_slug_key`(`slug`),
    UNIQUE INDEX `tax_payments_document_no_key`(`document_no`),
    INDEX `tax_payments_tax_type_id_idx`(`tax_type_id`),
    INDEX `tax_payments_tax_account_id_idx`(`tax_account_id`),
    INDEX `tax_payments_payment_account_id_idx`(`payment_account_id`),
    INDEX `tax_payments_date_idx`(`date`),
    INDEX `tax_payments_period_idx`(`period`),
    INDEX `tax_payments_created_by_idx`(`created_by`),
    INDEX `tax_payments_created_at_idx`(`created_at`),
    INDEX `tax_payments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `tax_payments_tax_type_id_fkey` FOREIGN KEY (`tax_type_id`)
      REFERENCES `withholding_tax_types`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
