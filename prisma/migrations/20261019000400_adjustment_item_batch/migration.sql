-- P1-1: adjustment penambahan stok batch-tracked tanpa identitas lot.
-- Kolom ini menyimpan batch eksplisit per baris; hook menolak IN
-- batch-tracked tanpa identitas. Baris lama (NULL) = tak tercatat.
ALTER TABLE `stock_adjustment_items`
  ADD COLUMN `batch_numbers` JSON NULL;
