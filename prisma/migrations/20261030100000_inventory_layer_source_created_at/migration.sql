-- STOK-08/CST-02: layer tujuan transfer membawa umur FIFO lapisan sumber.
-- Kolom nullable aditif; layer lama NULL dan FIFO memakai created_at
-- (COALESCE), jadi tidak ada backfill dan tidak ada perilaku berubah
-- untuk layer non-transfer.
ALTER TABLE `inventory_layers` ADD COLUMN `source_created_at` DATETIME(3) NULL;
-- Umur lapisan sumber ditangkap saat transfer diproses (OUT), diteruskan
-- ke lapisan tujuan saat diterima — penerimaan bisa beda hari/transaksi.
ALTER TABLE `inventory_transfer_items` ADD COLUMN `source_layer_created_at` DATETIME(3) NULL;
