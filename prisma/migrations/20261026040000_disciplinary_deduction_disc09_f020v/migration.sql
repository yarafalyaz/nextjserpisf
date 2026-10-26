-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `bpjs_employee_payable_account_id` INTEGER NULL,
    ADD COLUMN `disciplinary_fine_income_account_id` INTEGER NULL,
    ADD COLUMN `pph21_payable_account_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `disciplinary_deduction_decisions` (
    `slug` VARCHAR(191) NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_no` VARCHAR(191) NOT NULL,
    `decided_at` DATETIME(3) NOT NULL,
    `employee_id` INTEGER NOT NULL,
    `disciplinary_record_id` INTEGER NULL,
    `kind` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `compensation_account_id` INTEGER NULL,
    `suspension_kind` VARCHAR(191) NULL,
    `suspension_pay_treatment` VARCHAR(191) NULL,
    `regulation_reference` TEXT NULL,
    `signed_by` INTEGER NOT NULL,
    `created_by` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `disciplinary_deduction_decisions_slug_key`(`slug`),
    UNIQUE INDEX `disciplinary_deduction_decisions_document_no_key`(`document_no`),
    INDEX `disciplinary_deduction_decisions_employee_id_fkey`(`employee_id`),
    INDEX `idx_disciplinary_deduction_decisions_signer`(`signed_by`),
    INDEX `disciplinary_deduction_decisions_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `disciplinary_deduction_applications` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `decision_id` INTEGER NOT NULL,
    `payroll_id` INTEGER NULL,
    `period` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(15, 2) NOT NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `journal_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `disciplinary_deduction_applications_idempotency_key_key`(`idempotency_key`),
    UNIQUE INDEX `disciplinary_deduction_applications_journal_id_key`(`journal_id`),
    INDEX `idx_disciplinary_deduction_applications_payroll`(`payroll_id`),
    UNIQUE INDEX `uq_disc_deduction_decision_period_kind`(`decision_id`, `period`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `disciplinary_deduction_decisions` ADD CONSTRAINT `disciplinary_deduction_decisions_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `disciplinary_deduction_decisions` ADD CONSTRAINT `disciplinary_deduction_decisions_signed_by_fkey` FOREIGN KEY (`signed_by`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `disciplinary_deduction_decisions` ADD CONSTRAINT `disciplinary_deduction_decisions_disciplinary_record_id_fkey` FOREIGN KEY (`disciplinary_record_id`) REFERENCES `employee_disciplinary_records`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `disciplinary_deduction_decisions` ADD CONSTRAINT `disciplinary_deduction_decisions_compensation_account_id_fkey` FOREIGN KEY (`compensation_account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `disciplinary_deduction_applications` ADD CONSTRAINT `disciplinary_deduction_applications_decision_id_fkey` FOREIGN KEY (`decision_id`) REFERENCES `disciplinary_deduction_decisions`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `disciplinary_deduction_applications` ADD CONSTRAINT `disciplinary_deduction_applications_payroll_id_fkey` FOREIGN KEY (`payroll_id`) REFERENCES `payrolls`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `disciplinary_deduction_applications` ADD CONSTRAINT `disciplinary_deduction_applications_journal_id_fkey` FOREIGN KEY (`journal_id`) REFERENCES `journals`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

