-- AUD-R8-02: ikat idempotency key ke fingerprint payload operasi.
-- Replay dengan payload berbeda = konflik, bukan sukses palsu.
-- Kolom baru di tabel BARU R5 (bukan tabel produksi lama) — aman.
-- MySQL 8 (prod) tak dukung sintaks MariaDB "ADD COLUMN IF NOT EXISTS":
-- pola guard information_schema di bawah ekuivalen (no-op bila kolom sudah
-- ada) dan jalan di MySQL 8 + MariaDB. Histori tak diubah: kolom lahir di
-- migrasi ini (branch audit, belum merge ke main), jadi revisi in-place aman.
SET @s := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE `financial_idempotency_keys` ADD COLUMN `payload_hash` VARCHAR(191) NULL AFTER `scope`',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'financial_idempotency_keys' AND column_name = 'payload_hash');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
