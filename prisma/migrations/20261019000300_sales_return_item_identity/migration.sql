-- P1-1: identitas fisik retur jual. Hook merevive serial "terbaru" dan layer
-- tanpa batch — bukan identitas yang benar-benar kembali. Kolom ini menyimpan
-- serial/batch eksplisit per baris; complete menolak baris tracked tanpa
-- identitas. Baris lama (NULL) = identitas tak tercatat.
ALTER TABLE `sales_return_items`
  ADD COLUMN `serial_numbers` JSON NULL,
  ADD COLUMN `batch_numbers` JSON NULL;
