-- Transfer Pemasok: penanda eksekusi transfer bank pada pembayaran vendor.
-- Operasional saja — jurnal kas/bank sudah dibuat oleh pembayaran, jadi kolom ini
-- tidak menambah jurnal apa pun.
--
-- Idempoten (dijaga information_schema).

SET @kolom := (SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'vendor_payments' AND column_name = 'transferred_at');
SET @sql := IF(@kolom = 0,
  'ALTER TABLE `vendor_payments`
     ADD COLUMN `transferred_at` DATETIME(3) NULL,
     ADD COLUMN `transfer_reference` VARCHAR(191) NULL,
     ADD INDEX `vendor_payments_transferred_at_idx`(`transferred_at`)',
  'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
