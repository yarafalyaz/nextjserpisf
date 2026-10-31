-- R8-PAJAK-01: faktur pengganti memakai nomor seri yang sama dengan faktur
-- yang diganti, jadi dua baris boleh menyimpan nomor tersebut asal hanya
-- satu yang masih hidup (selain `replaced`). Unique lama atas
-- (direction, tax_invoice_number) menolak create pengganti dengan P2002
-- walaupun baris asal sudah ditandai `replaced` dalam transaksi yang sama.
--
-- Kunci aktif dibuat sebagai kolom GENERATED STORED lalu diberi unique
-- index; baris `replaced` menghasilkan NULL dan berhenti memegang nomor.
-- Catatan penerapan sama seperti migrasi jurnal F-127-V: pre-check
-- gagal-berisik memakai dynamic SQL, tanpa DELIMITER/stored procedure.
-- Pelanggar = lebih dari satu baris aktif (selain `replaced`) berbagi
-- (direction, tax_invoice_number); operator perbaiki data lalu jalankan ulang.
SET @r8pajak01_dup := (
  SELECT COUNT(*) FROM (
    SELECT 1 FROM `tax_invoices`
    WHERE `djp_status` <> 'replaced'
    GROUP BY `direction`, `tax_invoice_number` HAVING COUNT(*) > 1
  ) dup
);
SET @r8pajak01_sql := IF(
  @r8pajak01_dup > 0,
  'SELECT 1 FROM `r8pajak01_DUPLICATE_ACTIVE_TAXINVOICE_NUMBER_MIGRATION_MUST_STOP`',
  'SELECT 1'
);
PREPARE r8pajak01_stmt FROM @r8pajak01_sql;
EXECUTE r8pajak01_stmt;
DEALLOCATE PREPARE r8pajak01_stmt;

ALTER TABLE `tax_invoices` DROP INDEX `uq_tax_invoices_direction_number`;

ALTER TABLE `tax_invoices` ADD COLUMN `active_number_key` VARCHAR(191) GENERATED ALWAYS AS (
  CASE
    WHEN `djp_status` <> 'replaced'
    THEN CONCAT(`direction`, '#', `tax_invoice_number`)
    ELSE NULL
  END
) STORED;

CREATE UNIQUE INDEX `tax_invoices_active_number_unique` ON `tax_invoices`(`active_number_key`);
