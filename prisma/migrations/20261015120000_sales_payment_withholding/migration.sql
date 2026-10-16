-- PPh yang dipotong pelanggan atas pembayaran penjualan (bukti potong sisi penjualan).
--
-- `amount` tetap berarti kas yang benar-benar diterima, jadi PPh dipotong
-- pelanggan disimpan terpisah di sini. Pelunasan piutang dihitung dari
-- `amount + withholding_amount`, dan jurnalnya:
--   Dr Kas (amount) + Dr PPh dibayar dimuka (withholding_amount) / Cr Piutang.
ALTER TABLE `sales_payments`
  ADD COLUMN `withholding_type_id` INTEGER NULL,
  ADD COLUMN `withholding_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
  ADD COLUMN `withholding_certificate_no` VARCHAR(191) NULL,
  ADD COLUMN `withholding_date` DATETIME(3) NULL;

CREATE INDEX `sales_payments_withholding_type_id_idx` ON `sales_payments`(`withholding_type_id`);

ALTER TABLE `sales_payments`
  ADD CONSTRAINT `sales_payments_withholding_type_id_fkey`
  FOREIGN KEY (`withholding_type_id`) REFERENCES `withholding_tax_types`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
