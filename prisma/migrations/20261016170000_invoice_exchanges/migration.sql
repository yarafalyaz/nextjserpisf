-- Tukar faktur: dokumen penyerahan faktur + tanda terima penagihan piutang.
-- TANPA jurnal (piutang sudah tercatat oleh fakturnya).
--
-- Idempoten (dijaga information_schema): tabel dev dibuat lewat `prisma db push`.

SET @tabel := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'invoice_exchanges');
SET @sql := IF(@tabel = 0,
  'CREATE TABLE `invoice_exchanges` (
    `slug` VARCHAR(191) NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_no` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `receipt_number` VARCHAR(191) NULL,
    `due_date` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    UNIQUE INDEX `invoice_exchanges_slug_key`(`slug`),
    UNIQUE INDEX `invoice_exchanges_document_no_key`(`document_no`),
    INDEX `invoice_exchanges_customer_id_idx`(`customer_id`),
    INDEX `invoice_exchanges_date_idx`(`date`),
    INDEX `invoice_exchanges_created_by_idx`(`created_by`),
    INDEX `invoice_exchanges_created_at_idx`(`created_at`),
    INDEX `invoice_exchanges_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `invoice_exchanges_customer_id_fkey` FOREIGN KEY (`customer_id`)
      REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @tabel2 := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'invoice_exchange_items');
SET @sql2 := IF(@tabel2 = 0,
  'CREATE TABLE `invoice_exchange_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `exchange_id` INTEGER NOT NULL,
    `sales_invoice_id` INTEGER NOT NULL,
    `amount` DECIMAL(15,2) NOT NULL,
    INDEX `invoice_exchange_items_exchange_id_idx`(`exchange_id`),
    INDEX `invoice_exchange_items_sales_invoice_id_idx`(`sales_invoice_id`),
    PRIMARY KEY (`id`),
    CONSTRAINT `invoice_exchange_items_exchange_id_fkey` FOREIGN KEY (`exchange_id`)
      REFERENCES `invoice_exchanges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `invoice_exchange_items_sales_invoice_id_fkey` FOREIGN KEY (`sales_invoice_id`)
      REFERENCES `sales_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
