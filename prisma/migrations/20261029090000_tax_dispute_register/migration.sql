-- CreateTable
CREATE TABLE `tax_assessments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `assessment_number` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `tax_kind` VARCHAR(191) NULL,
    `tax_period` VARCHAR(191) NULL,
    `assessed_amount` DECIMAL(15, 2) NOT NULL,
    `disputed_amount` DECIMAL(15, 2) NOT NULL,
    `paid_under_protest` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `sent_at` DATETIME(3) NULL,
    `received_at` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'TERDAFTAR',
    `tax_payment_id` INTEGER NULL,
    `tax_invoice_id` INTEGER NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `tax_assessments_slug_key`(`slug`),
    INDEX `tax_assessments_kind_idx`(`kind`),
    INDEX `tax_assessments_tax_kind_idx`(`tax_kind`),
    INDEX `tax_assessments_status_idx`(`status`),
    INDEX `tax_assessments_sent_at_idx`(`sent_at`),
    INDEX `tax_assessments_tax_payment_id_idx`(`tax_payment_id`),
    INDEX `tax_assessments_deleted_at_idx`(`deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tax_dispute_steps` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `assessment_id` INTEGER NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `article36_subkind` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'DIAJUKAN',
    `filed_at` DATETIME(3) NULL,
    `late_reason` TEXT NULL,
    `decided_at` DATETIME(3) NULL,
    `decided_amount` DECIMAL(15, 2) NULL,
    `result` VARCHAR(191) NULL,
    `filed_by` INTEGER NULL,
    `decision_by` INTEGER NULL,
    `decision_notes` TEXT NULL,
    `evidence_ref` VARCHAR(191) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `tax_dispute_steps_assessment_id_idx`(`assessment_id`),
    INDEX `tax_dispute_steps_kind_idx`(`kind`),
    INDEX `tax_dispute_steps_status_idx`(`status`),
    INDEX `tax_dispute_steps_filed_at_idx`(`filed_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `tax_dispute_steps` ADD CONSTRAINT `tax_dispute_steps_assessment_id_fkey` FOREIGN KEY (`assessment_id`) REFERENCES `tax_assessments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tax_assessments` ADD CONSTRAINT `tax_assessments_tax_payment_id_fkey` FOREIGN KEY (`tax_payment_id`) REFERENCES `tax_payments`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tax_assessments` ADD CONSTRAINT `tax_assessments_tax_invoice_id_fkey` FOREIGN KEY (`tax_invoice_id`) REFERENCES `tax_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

