-- Uang muka pembelian (down payment ke vendor) + jurnalnya.
--
-- Ditulis idempoten (dijaga information_schema) karena tabel/kolom dev dibuat
-- lewat `prisma db push`, jadi migrasi ini bisa dijalankan di DB yang sudah
-- memuat tabelnya tanpa gagal.

SET @tabel := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'purchase_advances');

SET @sql := IF(@tabel = 0,
  'CREATE TABLE `purchase_advances` (
    `slug` VARCHAR(191) NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_no` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `vendor_id` INTEGER NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    `payment_account_id` INTEGER NOT NULL,
    `advance_account_id` INTEGER NOT NULL,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT ''posted'',
    `journal_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    UNIQUE INDEX `purchase_advances_slug_key`(`slug`),
    UNIQUE INDEX `purchase_advances_document_no_key`(`document_no`),
    INDEX `purchase_advances_vendor_id_fkey`(`vendor_id`),
    INDEX `purchase_advances_date_idx`(`date`),
    INDEX `purchase_advances_status_idx`(`status`),
    INDEX `purchase_advances_created_by_idx`(`created_by`),
    INDEX `purchase_advances_created_at_idx`(`created_at`),
    INDEX `purchase_advances_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `purchase_advances_vendor_id_fkey` FOREIGN KEY (`vendor_id`)
      REFERENCES `vendors`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
