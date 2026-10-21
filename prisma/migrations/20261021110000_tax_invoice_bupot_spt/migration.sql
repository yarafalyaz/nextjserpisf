-- F-2026-10-21-001/002/003/004/005/006 (vonis accountant backlog:358-527):
-- TaxInvoice + WithholdingCertificate dokumen sendiri, snapshot retur,
-- setor terstruktur, gerbang standard-costing. Aditif semua; kolom lama
-- (taxInvoiceNumber dsb) dipertahankan cermin, bukan sumber kebenaran.
-- SQL dihasilkan: prisma migrate diff HEAD-schema -> schema.prisma.
-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `production_variance_account_id` INTEGER NULL,
    ADD COLUMN `standard_costing_enabled` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `withholding_tax_types` ADD COLUMN `article` VARCHAR(191) NULL,
    ADD COLUMN `object_code` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `tax_payments` ADD COLUMN `billing_code` VARCHAR(15) NULL,
    ADD COLUMN `ntpn` VARCHAR(16) NULL,
    ADD COLUMN `tax_kind` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `sales_returns` ADD COLUMN `source_tax_invoice_id` INTEGER NULL,
    ADD COLUMN `tax_return_note_date` DATETIME(3) NULL,
    ADD COLUMN `tax_return_note_number` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `sales_return_items` ADD COLUMN `return_dpp` DECIMAL(15, 2) NULL,
    ADD COLUMN `return_vat` DECIMAL(15, 2) NULL,
    ADD COLUMN `source_tax_invoice_id` INTEGER NULL,
    ADD COLUMN `source_tax_rate` DECIMAL(5, 2) NULL;

-- AlterTable
ALTER TABLE `purchase_returns` ADD COLUMN `source_tax_invoice_id` INTEGER NULL,
    ADD COLUMN `tax_return_note_date` DATETIME(3) NULL,
    ADD COLUMN `tax_return_note_number` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `purchase_return_items` ADD COLUMN `price` DECIMAL(15, 2) NULL,
    ADD COLUMN `return_dpp` DECIMAL(15, 2) NULL,
    ADD COLUMN `return_vat` DECIMAL(15, 2) NULL,
    ADD COLUMN `source_tax_invoice_id` INTEGER NULL,
    ADD COLUMN `source_tax_rate` DECIMAL(5, 2) NULL;

-- CreateTable
CREATE TABLE `tax_invoices` (
    `slug` VARCHAR(191) NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `direction` VARCHAR(191) NOT NULL,
    `transaction_code` VARCHAR(2) NOT NULL,
    `tax_invoice_number` VARCHAR(191) NOT NULL,
    `tax_invoice_date` DATETIME(3) NOT NULL,
    `tax_period` VARCHAR(7) NOT NULL,
    `dpp` DECIMAL(15, 2) NOT NULL,
    `tax_rate` DECIMAL(5, 2) NOT NULL DEFAULT 12.00,
    `tax_amount` DECIMAL(15, 2) NOT NULL,
    `djp_status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `sales_invoice_id` INTEGER NULL,
    `vendor_bill_id` INTEGER NULL,
    `vendor_id` INTEGER NULL,
    `replaces_id` INTEGER NULL,
    `replace_reason` TEXT NULL,
    `counterparty_tax_id` VARCHAR(191) NULL,
    `counterparty_name` VARCHAR(191) NULL,
    `counterparty_nitku` VARCHAR(191) NULL,
    `credit_period` VARCHAR(7) NULL,
    `credited_at` DATETIME(3) NULL,
    `credit_status` VARCHAR(191) NOT NULL DEFAULT 'uncredited',
    `non_creditable_reason` VARCHAR(191) NULL,
    `creditable_percent` DECIMAL(5, 2) NOT NULL DEFAULT 100.00,
    `xml_payload` TEXT NULL,
    `xml_hash` VARCHAR(191) NULL,
    `xml_imported_at` DATETIME(3) NULL,
    `djp_message` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tax_invoices_slug_key`(`slug`),
    UNIQUE INDEX `tax_invoices_replaces_id_key`(`replaces_id`),
    INDEX `idx_tax_invoices_direction_number`(`direction`, `tax_invoice_number`),
    INDEX `idx_tax_invoices_period`(`tax_period`),
    INDEX `idx_tax_invoices_status`(`djp_status`),
    INDEX `idx_tax_invoices_credit_period`(`credit_period`),
    INDEX `idx_tax_invoices_credit_status`(`credit_status`),
    INDEX `idx_tax_invoices_sales_invoice`(`sales_invoice_id`),
    INDEX `idx_tax_invoices_vendor_bill`(`vendor_bill_id`),
    INDEX `idx_tax_invoices_vendor`(`vendor_id`),
    INDEX `idx_tax_invoices_spt_input`(`direction`, `credit_status`, `credit_period`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `withholding_certificates` (
    `slug` VARCHAR(191) NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `direction` VARCHAR(191) NOT NULL,
    `certificate_number` VARCHAR(191) NOT NULL,
    `withholding_date` DATETIME(3) NOT NULL,
    `tax_period` VARCHAR(7) NOT NULL,
    `counterparty_tax_id` VARCHAR(191) NULL,
    `counterparty_name` VARCHAR(191) NOT NULL,
    `withholding_type_id` INTEGER NOT NULL,
    `article` VARCHAR(191) NOT NULL,
    `object_code` VARCHAR(191) NULL,
    `dpp` DECIMAL(15, 2) NOT NULL,
    `tariff` DECIMAL(5, 2) NOT NULL,
    `withheld_amount` DECIMAL(15, 2) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `vendor_bill_id` INTEGER NULL,
    `sales_payment_id` INTEGER NULL,
    `facility` VARCHAR(191) NULL,
    `facility_number` VARCHAR(191) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `withholding_certificates_slug_key`(`slug`),
    INDEX `idx_withholding_certificates_period`(`tax_period`),
    INDEX `idx_withholding_certificates_status`(`status`),
    INDEX `idx_withholding_certificates_type`(`withholding_type_id`),
    INDEX `idx_withholding_certificates_vendor_bill`(`vendor_bill_id`),
    INDEX `idx_withholding_certificates_sales_payment`(`sales_payment_id`),
    UNIQUE INDEX `uq_withholding_certificates_number`(`certificate_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `idx_sales_returns_source_tax_invoice` ON `sales_returns`(`source_tax_invoice_id`);

-- CreateIndex
CREATE INDEX `idx_purchase_returns_source_tax_invoice` ON `purchase_returns`(`source_tax_invoice_id`);

-- CreateIndex
CREATE INDEX `idx_vendor_bills_tax_invoice` ON `vendor_bills`(`vendor_id`, `tax_invoice_number`);

-- AddForeignKey
ALTER TABLE `tax_invoices` ADD CONSTRAINT `tax_invoices_sales_invoice_id_fkey` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tax_invoices` ADD CONSTRAINT `tax_invoices_vendor_bill_id_fkey` FOREIGN KEY (`vendor_bill_id`) REFERENCES `vendor_bills`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tax_invoices` ADD CONSTRAINT `tax_invoices_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tax_invoices` ADD CONSTRAINT `tax_invoices_replaces_id_fkey` FOREIGN KEY (`replaces_id`) REFERENCES `tax_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `withholding_certificates` ADD CONSTRAINT `withholding_certificates_withholding_type_id_fkey` FOREIGN KEY (`withholding_type_id`) REFERENCES `withholding_tax_types`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `withholding_certificates` ADD CONSTRAINT `withholding_certificates_vendor_bill_id_fkey` FOREIGN KEY (`vendor_bill_id`) REFERENCES `vendor_bills`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `withholding_certificates` ADD CONSTRAINT `withholding_certificates_sales_payment_id_fkey` FOREIGN KEY (`sales_payment_id`) REFERENCES `sales_payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_returns` ADD CONSTRAINT `sales_returns_source_tax_invoice_id_fkey` FOREIGN KEY (`source_tax_invoice_id`) REFERENCES `tax_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_returns` ADD CONSTRAINT `purchase_returns_source_tax_invoice_id_fkey` FOREIGN KEY (`source_tax_invoice_id`) REFERENCES `tax_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

