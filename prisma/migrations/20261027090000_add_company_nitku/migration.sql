-- TASK-020 B5: sumber NITKU penjual untuk ekspor Coretax (SellerIDTKU).
-- Aditif saja: 1 kolom nullable; NULL = belum diisi (builder ekspor menolak
-- fail-closed bernama, perilaku lama untuk instalasi tanpa NITKU).

-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `company_nitku` VARCHAR(191) NULL;
