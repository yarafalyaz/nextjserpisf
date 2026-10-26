-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `credit_gate_enabled` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `credit_overrides` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_id` INTEGER NOT NULL,
    `document_type` VARCHAR(16) NOT NULL,
    `fingerprint` VARCHAR(64) NOT NULL,
    `attempted_amount` DECIMAL(15, 2) NOT NULL,
    `credit_limit` DECIMAL(15, 2) NOT NULL,
    `exposure` DECIMAL(15, 2) NOT NULL,
    `exposure_status` VARCHAR(16) NOT NULL,
    `utilization` DECIMAL(8, 2) NULL,
    `quotation_id` INTEGER NULL,
    `sales_order_id` INTEGER NULL,
    `requested_by` INTEGER NOT NULL,
    `request_reason` TEXT NOT NULL,
    `status` VARCHAR(16) NOT NULL DEFAULT 'pending',
    `decided_by` INTEGER NULL,
    `decided_at` DATETIME(3) NULL,
    `decision_reason` TEXT NULL,
    `used_document_id` INTEGER NULL,
    `used_document_no` VARCHAR(191) NULL,
    `expires_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_credit_overrides_cust_status`(`customer_id`, `status`),
    INDEX `idx_credit_overrides_fp_status`(`fingerprint`, `status`),
    INDEX `idx_credit_overrides_req_status`(`requested_by`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `credit_overrides` ADD CONSTRAINT `credit_overrides_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

