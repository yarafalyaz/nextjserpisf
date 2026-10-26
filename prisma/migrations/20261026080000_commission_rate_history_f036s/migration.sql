-- F-2026-10-25-036-S: histori tarif komisi per kategori pelanggan + snapshot faktur.
-- Aditif: tabel baru customer_commission_rates + 3 kolom nullable di sales_invoices.
-- Snapshot NULL = faktur lama tanpa snapshot (BR-KT36-13, tanpa backfill).

CREATE TABLE `customer_commission_rates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `customer_category_id` INTEGER NOT NULL,
  `commission_percent` DECIMAL(5, 2) NOT NULL,
  `effective_from` DATE NOT NULL,
  `effective_to` DATE NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,

  INDEX `idx_commission_rate_category_from`(`customer_category_id`, `effective_from`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `customer_commission_rates`
  ADD CONSTRAINT `customer_commission_rates_customer_category_id_fkey`
    FOREIGN KEY (`customer_category_id`) REFERENCES `customer_categories`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `sales_invoices`
  ADD COLUMN `commission_rate_percent` DECIMAL(5, 2) NULL,
  ADD COLUMN `commission_customer_category_id` INTEGER NULL,
  ADD COLUMN `commission_rate_id` INTEGER NULL;

ALTER TABLE `sales_invoices`
  ADD CONSTRAINT `sales_invoices_commission_customer_category_id_fkey`
    FOREIGN KEY (`commission_customer_category_id`) REFERENCES `customer_categories`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `sales_invoices_commission_rate_id_fkey`
    FOREIGN KEY (`commission_rate_id`) REFERENCES `customer_commission_rates`(`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;
