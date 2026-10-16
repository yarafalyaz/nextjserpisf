-- Menghapus modul Tenaga Penjual (Salesperson) beserta target penjualannya.
--
-- Urutan penting: kolom `sales_invoices.salesperson_id` dan FK-nya dihapus lebih dulu,
-- baru tabelnya — kalau tabel induk dihapus dulu, FK-nya menghalangi.
-- Ditulis idempoten karena tabel/kolom di dev dibuat lewat `prisma db push`
-- (MySQL tidak punya `DROP TABLE/COLUMN IF EXISTS`).

-- 1. FK di sales_invoices → salespersons
SET @fk := (
  SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_invoices'
    AND COLUMN_NAME = 'salesperson_id' AND REFERENCED_TABLE_NAME IS NOT NULL
  LIMIT 1
);
SET @sql_fk := IF(@fk IS NULL, 'SELECT 1', CONCAT('ALTER TABLE `sales_invoices` DROP FOREIGN KEY `', @fk, '`'));
PREPARE st1 FROM @sql_fk;
EXECUTE st1;
DEALLOCATE PREPARE st1;

-- 2. Kolom salesperson_id
SET @col := (
  SELECT COLUMN_NAME FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_invoices' AND COLUMN_NAME = 'salesperson_id'
  LIMIT 1
);
SET @sql_col := IF(@col IS NULL, 'SELECT 1', 'ALTER TABLE `sales_invoices` DROP COLUMN `salesperson_id`');
PREPARE st2 FROM @sql_col;
EXECUTE st2;
DEALLOCATE PREPARE st2;

-- 3. Tabel sales_targets lalu salespersons
SET @targets := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales_targets'
);
SET @sql_targets := IF(@targets = 0, 'SELECT 1', 'DROP TABLE `sales_targets`');
PREPARE st3 FROM @sql_targets;
EXECUTE st3;
DEALLOCATE PREPARE st3;

SET @people := (
  SELECT COUNT(*) FROM information_schema.TABLES
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'salespersons'
);
SET @sql_people := IF(@people = 0, 'SELECT 1', 'DROP TABLE `salespersons`');
PREPARE st4 FROM @sql_people;
EXECUTE st4;
DEALLOCATE PREPARE st4;

-- 4. Izin modul ini ikut dihapus agar tidak menjadi baris yatim.
DELETE FROM `permissions`
WHERE `name` IN (
  'view_salespersons', 'create_salespersons', 'edit_salespersons',
  'delete_salespersons', 'manage_sales_targets'
);
