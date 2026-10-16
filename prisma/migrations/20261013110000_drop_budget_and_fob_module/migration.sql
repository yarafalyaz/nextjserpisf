-- Menghapus modul Anggaran (Budget) dan FOB / Incoterm.
--
-- Urutan: kolom + FK di purchase_orders & sales_orders dihapus lebih dulu, baru tabel
-- `fob_terms`; tabel `budgets` tidak dirujuk siapa pun sehingga bisa langsung.
-- Ditulis idempoten (MySQL tidak punya DROP ... IF EXISTS) karena tabel/kolom dev
-- dibuat lewat `prisma db push`.

-- 1. FK + kolom fob_term_id pada purchase_orders
SET @fk1 := (
  SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders'
    AND COLUMN_NAME = 'fob_term_id' AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1
);
SET @sql1 := IF(@fk1 IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `purchase_orders` DROP FOREIGN KEY `', @fk1, '`'));
PREPARE s1 FROM @sql1; EXECUTE s1; DEALLOCATE PREPARE s1;

SET @col1 := (SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_orders' AND COLUMN_NAME = 'fob_term_id' LIMIT 1);
SET @sql2 := IF(@col1 IS NULL, 'SELECT 1', 'ALTER TABLE `purchase_orders` DROP COLUMN `fob_term_id`');
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;

-- 2. FK + kolom fob_term_id pada sales_orders
SET @fk2 := (
  SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_orders'
    AND COLUMN_NAME = 'fob_term_id' AND REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1
);
SET @sql3 := IF(@fk2 IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `sales_orders` DROP FOREIGN KEY `', @fk2, '`'));
PREPARE s3 FROM @sql3; EXECUTE s3; DEALLOCATE PREPARE s3;

SET @col2 := (SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_orders' AND COLUMN_NAME = 'fob_term_id' LIMIT 1);
SET @sql4 := IF(@col2 IS NULL, 'SELECT 1', 'ALTER TABLE `sales_orders` DROP COLUMN `fob_term_id`');
PREPARE s4 FROM @sql4; EXECUTE s4; DEALLOCATE PREPARE s4;

-- 3. Tabel fob_terms & budgets
SET @fob := (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'fob_terms');
SET @sql5 := IF(@fob = 0, 'SELECT 1', 'DROP TABLE `fob_terms`');
PREPARE s5 FROM @sql5; EXECUTE s5; DEALLOCATE PREPARE s5;

SET @bud := (SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'budgets');
SET @sql6 := IF(@bud = 0, 'SELECT 1', 'DROP TABLE `budgets`');
PREPARE s6 FROM @sql6; EXECUTE s6; DEALLOCATE PREPARE s6;

-- 4. Izin modul ini ikut dibuang agar tidak menjadi baris yatim.
DELETE FROM `permissions`
WHERE `name` IN (
  'view_fob_terms', 'create_fob_terms', 'edit_fob_terms', 'delete_fob_terms',
  'view_budgets', 'create_budgets', 'edit_budgets', 'delete_budgets'
);
