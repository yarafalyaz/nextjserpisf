-- Metode fiskal kategori + baris tahun saldo fiskal terbekukan per aset
-- (vonis BOT 4 F-2026-10-23-109-V P1/P4). Aditif nullable: kategori
-- existing semua NULL = fiskal belum-dihitung (bukan fallback garis
-- lurus); baris tahun mulai kosong, generate idempoten mengisinya.
ALTER TABLE `asset_categories` ADD COLUMN `fiscal_method` VARCHAR(30) NULL;

-- CreateTable
CREATE TABLE `asset_fiscal_year_rows` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_id` INTEGER NOT NULL,
    `tax_year` INTEGER NOT NULL,
    `year_index` INTEGER NOT NULL,
    `opening_balance` DECIMAL(15, 2) NOT NULL,
    `depreciation` DECIMAL(15, 2) NOT NULL,
    `closing_balance` DECIMAL(15, 2) NOT NULL,
    `method` VARCHAR(30) NOT NULL,
    `group_code` VARCHAR(30) NOT NULL,
    `rate_percent` DECIMAL(5, 2) NOT NULL,
    `source` VARCHAR(30) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_fiscal_year_rows_asset_year_unique`(`asset_id`, `tax_year`),
    INDEX `asset_fiscal_year_rows_asset_id_fkey`(`asset_id`),
    INDEX `asset_fiscal_year_rows_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asset_fiscal_year_rows` ADD CONSTRAINT `asset_fiscal_year_rows_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
