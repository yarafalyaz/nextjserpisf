-- Kolom `balance` BankStatementLine mati penuh: TIDAK PERNAH ditulis aksi
-- (create/update hanya isi amount+debit+credit; default 0.00) dan TIDAK PERNAH
-- dibaca kode produk/laporan (saldo akhir = header `closingBalance` yang dihitung
-- ulang `recalcBankStatementTotals`). E2E `bank_statement_lines` 0 baris — drop aman.
-- Idempoten karena dev dibuat via `prisma db push` (pola migrasi 2026101621/22).
SET @s := (SELECT IF(COUNT(*) > 0,
  'ALTER TABLE `bank_statement_lines` DROP COLUMN `balance`',
  'SELECT 1') FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'bank_statement_lines' AND column_name = 'balance');
PREPARE stmt FROM @s; EXECUTE stmt; DEALLOCATE PREPARE stmt;
