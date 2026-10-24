-- Parameter komersial terbekukan per aset + dokumen unit aktual bernama
-- (vonis BOT 4 F-2026-10-23-118-V Putusan 2a/2b). Aditif nullable: baris
-- existing semua NULL/tanpa dokumen = mesin analitis wajib menolak
-- berisik (missing-parameter), tidak ada perilaku berubah tanpa isi.
ALTER TABLE `assets` ADD COLUMN `total_estimated_units` DECIMAL(15, 2) NULL;
ALTER TABLE `assets` ADD COLUMN `production_unit_name` VARCHAR(50) NULL;
ALTER TABLE `assets` ADD COLUMN `useful_life_months` INTEGER NULL;

-- CreateTable
CREATE TABLE `asset_usage_records` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_id` INTEGER NOT NULL,
    `period_year` INTEGER NOT NULL,
    `period_month` INTEGER NOT NULL,
    `actual_units` DECIMAL(15, 2) NOT NULL,
    `source_name` VARCHAR(200) NOT NULL,
    `source_ref` VARCHAR(200) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_usage_records_asset_period_unique`(`asset_id`, `period_year`, `period_month`),
    INDEX `asset_usage_records_asset_id_fkey`(`asset_id`),
    INDEX `asset_usage_records_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asset_usage_records` ADD CONSTRAINT `asset_usage_records_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
