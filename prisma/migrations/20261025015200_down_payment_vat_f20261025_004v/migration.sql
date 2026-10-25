-- F-2026-10-25-004-V: PPN uang muka DP/termin (vonis PR #760).
-- Snapshot PPN DP dibekukan saat confirm; FP UM tertaut DownPayment.
-- Semua kolom nullable aditif: DP legacy pra-fitur tetap valid (null).

ALTER TABLE `down_payments` ADD COLUMN `vat_transaction_code` VARCHAR(2) NULL;
ALTER TABLE `down_payments` ADD COLUMN `vat_rate` DECIMAL(5, 2) NULL;
ALTER TABLE `down_payments` ADD COLUMN `vat_dpp` DECIMAL(15, 2) NULL;
ALTER TABLE `down_payments` ADD COLUMN `vat_amount` DECIMAL(15, 2) NULL;
ALTER TABLE `down_payments` ADD COLUMN `vat_tax_period` VARCHAR(7) NULL;

ALTER TABLE `tax_invoices` ADD COLUMN `down_payment_id` INTEGER NULL;
CREATE INDEX `idx_tax_invoices_down_payment` ON `tax_invoices`(`down_payment_id`);
ALTER TABLE `tax_invoices` ADD CONSTRAINT `tax_invoices_down_payment_id_fkey` FOREIGN KEY (`down_payment_id`) REFERENCES `down_payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
