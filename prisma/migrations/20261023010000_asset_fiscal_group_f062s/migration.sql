-- Kelompok fiskal PMK 72/2023 di kategori aset (vonis F-2026-10-22-062-V
-- Putusan 2): kode kelompok + penanda jenis tercantum + penetapan DJP.
-- Aditif nullable/default; data lama tetap "belum dinyatakan" (null).
ALTER TABLE `asset_categories` ADD COLUMN `tax_group_code` VARCHAR(30) NULL;
ALTER TABLE `asset_categories` ADD COLUMN `tax_type_listed` BOOLEAN NULL;
ALTER TABLE `asset_categories` ADD COLUMN `tax_djp_determination` BOOLEAN NOT NULL DEFAULT false;
