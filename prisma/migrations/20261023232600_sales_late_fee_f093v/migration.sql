-- F-2026-10-22-093-V (vonis BOT 4 PR #563): inti denda piutang.
-- Dokumen tagih TERPISAH; nol ubah faktur asal, nol PPN.
-- Semua aditif: kolom setting nullable TANPA default tebak (kosong =
-- fail-closed E93-2), prefix dokumen default "LF" pola prefix lain.

ALTER TABLE `system_settings` ADD COLUMN `late_fee_income_account_id` INTEGER NULL;
ALTER TABLE `system_settings` ADD COLUMN `sales_late_fee_prefix` VARCHAR(191) NOT NULL DEFAULT 'LF';

-- CreateTable
CREATE TABLE `customer_late_fee_terms` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `rate_percent_per_day` DECIMAL(9, 6) NULL,
    `flat_amount_per_day` DECIMAL(15, 2) NULL,
    `cap_amount` DECIMAL(15, 2) NULL,
    `effective_from` DATETIME(3) NOT NULL,
    `effective_to` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customer_late_fee_terms_customer_id_effective_from_idx`(`customer_id`, `effective_from`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_late_fees` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_no` VARCHAR(191) NOT NULL,
    `sales_invoice_id` INTEGER NOT NULL,
    `customer_id` INTEGER NOT NULL,
    `term_id` INTEGER NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `due_reference_date` DATETIME(3) NOT NULL,
    `overdue_days` INTEGER NOT NULL,
    `basis_amount` DECIMAL(15, 2) NOT NULL,
    `rate_percent_per_day` DECIMAL(9, 6) NULL,
    `flat_amount_per_day` DECIMAL(15, 2) NULL,
    `cap_amount` DECIMAL(15, 2) NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `paid_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `status` VARCHAR(191) NOT NULL DEFAULT 'posted',
    `idempotency_key` VARCHAR(191) NOT NULL,
    `reverses_id` INTEGER NULL,
    `journal_id` INTEGER NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_late_fees_document_no_key`(`document_no`),
    UNIQUE INDEX `sales_late_fees_idempotency_key_key`(`idempotency_key`),
    UNIQUE INDEX `sales_late_fees_reverses_id_key`(`reverses_id`),
    INDEX `sales_late_fees_sales_invoice_id_idx`(`sales_invoice_id`),
    INDEX `sales_late_fees_customer_id_status_idx`(`customer_id`, `status`),
    INDEX `sales_late_fees_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sales_late_fee_payments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_no` VARCHAR(191) NOT NULL,
    `sales_late_fee_id` INTEGER NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `payment_date` DATETIME(3) NOT NULL,
    `payment_method` VARCHAR(191) NOT NULL,
    `account_id` INTEGER NULL,
    `reference_no` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `sales_late_fee_payments_document_no_key`(`document_no`),
    INDEX `sales_late_fee_payments_sales_late_fee_id_idx`(`sales_late_fee_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `customer_late_fee_terms` ADD CONSTRAINT `customer_late_fee_terms_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_late_fees` ADD CONSTRAINT `sales_late_fees_sales_invoice_id_fkey` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_late_fees` ADD CONSTRAINT `sales_late_fees_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_late_fees` ADD CONSTRAINT `sales_late_fees_term_id_fkey` FOREIGN KEY (`term_id`) REFERENCES `customer_late_fee_terms`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_late_fees` ADD CONSTRAINT `sales_late_fees_reverses_id_fkey` FOREIGN KEY (`reverses_id`) REFERENCES `sales_late_fees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sales_late_fee_payments` ADD CONSTRAINT `sales_late_fee_payments_sales_late_fee_id_fkey` FOREIGN KEY (`sales_late_fee_id`) REFERENCES `sales_late_fees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
