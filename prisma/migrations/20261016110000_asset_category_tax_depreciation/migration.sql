-- Penyusutan fiskal (pajak) per kategori aset, untuk laporan
-- "Perbedaan Penyusutan (akuntansi vs pajak)".
--
-- Ditulis idempoten karena DB dev dibangun dengan `prisma db push`.

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_categories' AND COLUMN_NAME = 'tax_depreciation_rate');
SET @sql := IF(@col > 0, 'SELECT 1', 'ALTER TABLE `asset_categories` ADD COLUMN `tax_depreciation_rate` DECIMAL(5, 2) NULL');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_categories' AND COLUMN_NAME = 'tax_useful_life');
SET @sql := IF(@col > 0, 'SELECT 1', 'ALTER TABLE `asset_categories` ADD COLUMN `tax_useful_life` INTEGER NULL');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
