-- AUD-FIN-01: akun kewajiban Uang Muka Penjualan (CoA 210102).
-- ADD COLUMN nullable saja: instalasi lama tetap jalan (null = hook tolak
-- posting DP sampai dimapping = fail-closed, bukan salah catat diam-diam).
-- MySQL 8 (prod) tak dukung sintaks MariaDB "ADD COLUMN IF NOT EXISTS":
-- pola guard information_schema di bawah ekuivalen (no-op bila kolom sudah
-- ada) dan jalan di MySQL 8 + MariaDB. Histori tak diubah: kolom lahir di
-- migrasi ini (branch audit, belum merge ke main), jadi revisi in-place aman.
SET @s := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE `system_settings` ADD COLUMN `customer_down_payment_account_id` INTEGER NULL',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'system_settings' AND column_name = 'customer_down_payment_account_id');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
