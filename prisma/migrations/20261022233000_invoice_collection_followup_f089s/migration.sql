-- CreateTable
CREATE TABLE `invoice_collection_followups` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sales_invoice_id` INTEGER NOT NULL,
    `followed_up_at` DATETIME(3) NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `outcome` VARCHAR(191) NOT NULL,
    `promised_date` DATETIME(3) NULL,
    `promised_amount` DECIMAL(15, 2) NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `invoice_collection_followups_sales_invoice_id_idx`(`sales_invoice_id`),
    INDEX `invoice_collection_followups_deleted_at_idx`(`deleted_at`),
    INDEX `invoice_collection_followups_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `invoice_collection_followups` ADD CONSTRAINT `invoice_collection_followups_sales_invoice_id_fkey` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
