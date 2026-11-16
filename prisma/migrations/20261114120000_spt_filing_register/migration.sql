-- CreateTable
CREATE TABLE `spt_filings` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `spt_type` VARCHAR(191) NOT NULL,
    `period` VARCHAR(191) NOT NULL,
    `amendment_no` INTEGER NOT NULL DEFAULT 0,
    `filed_at` DATETIME(3) NOT NULL,
    `bpe_number` VARCHAR(191) NOT NULL,
    `under_over_payment` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `compensation_balance` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `tax_payment_id` INTEGER NULL,
    `variance_note` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `spt_filings_period_idx`(`period`),
    INDEX `spt_filings_bpe_number_idx`(`bpe_number`),
    INDEX `spt_filings_tax_payment_id_idx`(`tax_payment_id`),
    UNIQUE INDEX `spt_filings_spt_type_period_amendment_no_key`(`spt_type`, `period`, `amendment_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `spt_filings` ADD CONSTRAINT `spt_filings_tax_payment_id_fkey` FOREIGN KEY (`tax_payment_id`) REFERENCES `tax_payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
