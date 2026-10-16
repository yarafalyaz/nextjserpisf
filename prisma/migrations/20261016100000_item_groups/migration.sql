-- Grup barang (Accurate: "Barang Grup") — master pengelompokan sejajar Kategori.
--
-- Ditulis idempoten (MySQL tidak punya CREATE TABLE IF NOT EXISTS lewat Prisma)
-- karena DB dev dibangun dengan `prisma db push`, sehingga tabel/kolom bisa saja
-- sudah ada saat migrasi ini dijalankan pada DB yang sudah jalan.

-- 1. Tabel item_groups
SET @tbl := (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'item_groups');
SET @sql := IF(@tbl > 0, 'SELECT 1', '
CREATE TABLE `item_groups` (
  `slug` VARCHAR(191) NULL,
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `code` VARCHAR(191) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `description` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` INTEGER NULL,
  `updated_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `item_groups_slug_key`(`slug`),
  UNIQUE INDEX `item_groups_code_key`(`code`),
  INDEX `item_groups_is_active_idx`(`is_active`),
  INDEX `item_groups_created_at_idx`(`created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

-- 2. Kolom items.group_id + index + FK
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND COLUMN_NAME = 'group_id');
SET @sql := IF(@col > 0, 'SELECT 1', 'ALTER TABLE `items` ADD COLUMN `group_id` INTEGER NULL');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items' AND INDEX_NAME = 'items_group_id_fkey');
SET @sql := IF(@idx > 0, 'SELECT 1', 'CREATE INDEX `items_group_id_fkey` ON `items`(`group_id`)');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;

SET @fk := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'items'
    AND CONSTRAINT_NAME = 'items_group_id_fkey' AND CONSTRAINT_TYPE = 'FOREIGN KEY');
SET @sql := IF(@fk > 0, 'SELECT 1',
  'ALTER TABLE `items` ADD CONSTRAINT `items_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `item_groups`(`id`) ON DELETE SET NULL ON UPDATE CASCADE');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
