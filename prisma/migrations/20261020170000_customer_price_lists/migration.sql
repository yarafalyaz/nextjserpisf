-- F-PRICELIST-01 tahap 1: daftar harga jual per kategori pelanggan dan/atau per item.
-- Tabel BARU aditif; tanpa ALTER tabel existing, tanpa backfill.
-- customer_category_id NULL = harga per item berlaku semua kategori.
-- Catatan MySQL: kolom nullable di UNIQUE index memperlakukan NULL sebagai
-- berbeda, jadi duplikat baris umum dicegah di aksi (cek findFirst), bukan DB.
-- CreateTable
CREATE TABLE `customer_price_lists` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_category_id` INTEGER NULL,
    `item_id` INTEGER NOT NULL,
    `price` DECIMAL(15, 2) NOT NULL,
    `effective_date` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customer_price_lists_item_id_fkey`(`item_id`),
    INDEX `customer_price_lists_category_id_fkey`(`customer_category_id`),
    INDEX `customer_price_lists_created_at_idx`(`created_at`),
    UNIQUE INDEX `uq_customer_price_list`(`customer_category_id`, `item_id`, `effective_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customer_price_lists` ADD CONSTRAINT `customer_price_lists_customer_category_id_fkey` FOREIGN KEY (`customer_category_id`) REFERENCES `customer_categories`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_price_lists` ADD CONSTRAINT `customer_price_lists_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

