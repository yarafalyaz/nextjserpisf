-- Tagihan yang ditargetkan oleh sebuah pembayaran vendor.
-- Dipilih lewat tombol "Bayar" di halaman tagihan; saat dikonfirmasi, alokasi
-- diutamakan ke tagihan ini (boleh sebagian), sisanya oldest-first.
ALTER TABLE `vendor_payments` ADD COLUMN `vendor_bill_id` INTEGER NULL;
CREATE INDEX `vendor_payments_vendor_bill_id_idx` ON `vendor_payments`(`vendor_bill_id`);
