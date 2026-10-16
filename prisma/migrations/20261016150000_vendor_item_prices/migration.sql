-- Daftar harga pemasok per barang (Accurate: "Harga Pemasok").
--
-- Idempoten (dijaga information_schema): tabel dev dibuat lewat `prisma db push`.

SET @tabel := (SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'vendor_item_prices');

SET @sql := IF(@tabel = 0,
  'CREATE TABLE `vendor_item_prices` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `vendor_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `price` DECIMAL(15,2) NOT NULL,
    `min_qty` DECIMAL(15,2) NOT NULL DEFAULT 1.00,
    `effective_date` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `uq_vendor_item_price`(`vendor_id`, `item_id`, `min_qty`),
    INDEX `vendor_item_prices_vendor_id_fkey`(`vendor_id`),
    INDEX `vendor_item_prices_item_id_fkey`(`item_id`),
    INDEX `vendor_item_prices_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`),
    CONSTRAINT `vendor_item_prices_vendor_id_fkey` FOREIGN KEY (`vendor_id`)
      REFERENCES `vendors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `vendor_item_prices_item_id_fkey` FOREIGN KEY (`item_id`)
      REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
