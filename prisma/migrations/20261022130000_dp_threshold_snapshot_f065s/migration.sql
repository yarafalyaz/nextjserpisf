-- F-2026-10-22-065-S (inti F-2026-10-20-108): snapshot persen ambang
-- konversi DP -> invoice per quotation. Kolom aditif nullable, tanpa
-- backfill: quotation lama tetap NULL (= fail-closed default 50, persis
-- perilaku berjalan); snapshot terisi saat quotation dibuat sesudah ini.

-- AlterTable
ALTER TABLE `quotations` ADD COLUMN `invoice_threshold_percent` DECIMAL(5, 2) NULL;
