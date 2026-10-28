-- F-2026-10-29-162-V (c): setting akun beban write-off piutang karyawan
-- (default diarahkan 720007 saat install/seed). Aditif saja, nullable.
ALTER TABLE `system_settings` ADD COLUMN `employee_loan_write_off_expense_account_id` INTEGER NULL;

-- F-2026-10-29-162-V (e)(f) BR-LOAN-07: dokumen setoran tunai pelunasan
-- pinjaman karyawan (aditif; FK RESTRICT pola repo).
CREATE TABLE `employee_loan_repayments` (
    `slug` VARCHAR(191) NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `loan_id` INTEGER NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `excess_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0,
    `cash_account_id` INTEGER NOT NULL,
    `repayment_date` DATETIME(3) NOT NULL,
    `received_by` INTEGER NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `employee_loan_repayments_slug_key`(`slug`),
    INDEX `employee_loan_repayments_loan_id_idx`(`loan_id`),
    INDEX `employee_loan_repayments_date_idx`(`repayment_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- F-2026-10-29-162-V (c) BR-LOAN-08: dokumen write-off piutang tak tertagih.
CREATE TABLE `employee_loan_write_offs` (
    `slug` VARCHAR(191) NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `loan_id` INTEGER NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `write_off_date` DATETIME(3) NOT NULL,
    `approved_by` INTEGER NULL,
    `reason` TEXT NOT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX `employee_loan_write_offs_slug_key`(`slug`),
    INDEX `employee_loan_write_offs_loan_id_idx`(`loan_id`),
    INDEX `employee_loan_write_offs_date_idx`(`write_off_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `employee_loan_repayments` ADD CONSTRAINT `employee_loan_repayments_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `employee_loans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `employee_loan_repayments` ADD CONSTRAINT `employee_loan_repayments_cash_account_id_fkey` FOREIGN KEY (`cash_account_id`) REFERENCES `accounts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `employee_loan_write_offs` ADD CONSTRAINT `employee_loan_write_offs_loan_id_fkey` FOREIGN KEY (`loan_id`) REFERENCES `employee_loans`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
