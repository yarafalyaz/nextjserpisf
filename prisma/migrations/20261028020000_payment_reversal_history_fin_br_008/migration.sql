-- FIN-BR-008 (vonis t_9a1c4453): reversal pembayaran berhistori.
-- Aditif saja: kolom reversal nullable di kedua model pembayaran +
-- status baru SalesPayment default 'posted' (baris lama otomatis posted).
-- Baris asal TIDAK dihapus saat reversal; histori + alasan tersimpan.

-- AlterTable
ALTER TABLE `sales_payments` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'posted',
    ADD COLUMN `reversed_at` DATETIME(3) NULL,
    ADD COLUMN `reversed_by` INTEGER NULL,
    ADD COLUMN `reversal_reason` TEXT NULL;

-- AlterTable
ALTER TABLE `vendor_payments` ADD COLUMN `reversed_at` DATETIME(3) NULL,
    ADD COLUMN `reversed_by` INTEGER NULL,
    ADD COLUMN `reversal_reason` TEXT NULL;

-- CreateIndex
CREATE INDEX `sales_payments_status_idx` ON `sales_payments`(`status`);
