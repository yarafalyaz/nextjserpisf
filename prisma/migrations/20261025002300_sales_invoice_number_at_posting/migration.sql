-- Nomor INV resmi baru diterbitkan saat posting.
-- Draft faktur penjualan tidak lagi mengonsumsi nomor: document_no menjadi
-- nullable, sedangkan unique index MySQL tetap mengizinkan banyak NULL.
-- Tidak ada backfill atau penomoran ulang: draft lama yang sudah memiliki
-- nomor mempertahankannya, dan nomor itu tidak pernah diterbitkan ulang.

-- AlterTable
ALTER TABLE `sales_invoices` MODIFY `document_no` VARCHAR(191) NULL;
