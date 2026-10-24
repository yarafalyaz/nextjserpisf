-- F-2026-10-25-001-S inti (BR-PX-01..08): tanggal berakhir opsional daftar
-- harga pelanggan. Aditif saja: 1 kolom nullable + 1 index antrean.
-- NULL = tanpa batas (perilaku lama byte-sama); tanpa backfill.
-- VendorItemPrice TIDAK disentuh (BR-PX-12).

-- AlterTable
ALTER TABLE `customer_price_lists` ADD COLUMN `expires_at` DATETIME(3) NULL;

-- CreateIndex
CREATE INDEX `idx_customer_price_lists_expires_at` ON `customer_price_lists`(`expires_at`);
