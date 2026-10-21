-- F-2026-10-21-027: komponen gaji terstruktur (3 tabel baru aditif).
-- Tanpa backfill; slip lama tanpa baris tetap sah agregat-only.
-- accountId master hanya disimpan — jurnal tetap agregat existing.

-- CreateTable
CREATE TABLE `payroll_components` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `normalized_name` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `recurrence` VARCHAR(191) NOT NULL,
    `is_taxable` BOOLEAN NOT NULL DEFAULT false,
    `account_id` INTEGER NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `payroll_components_normalized_name_idx`(`normalized_name`),
    INDEX `payroll_components_is_active_idx`(`is_active`),
    INDEX `payroll_components_account_id_idx`(`account_id`),
    INDEX `payroll_components_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `employee_payroll_components` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `component_id` INTEGER NOT NULL,
    `default_amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `effective_from` DATETIME(3) NOT NULL,
    `effective_to` DATETIME(3) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `employee_payroll_components_employee_id_idx`(`employee_id`),
    INDEX `employee_payroll_components_component_id_idx`(`component_id`),
    INDEX `employee_payroll_components_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payroll_component_lines` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `payroll_id` INTEGER NOT NULL,
    `component_id` INTEGER NULL,
    `component_name_snapshot` VARCHAR(191) NOT NULL,
    `kind_snapshot` VARCHAR(191) NOT NULL,
    `recurrence_snapshot` VARCHAR(191) NOT NULL,
    `is_taxable_snapshot` BOOLEAN NOT NULL DEFAULT false,
    `source` VARCHAR(191) NOT NULL,
    `assignment_id` INTEGER NULL,
    `account_id_snapshot` INTEGER NULL,
    `amount` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `payroll_component_lines_payroll_id_idx`(`payroll_id`),
    INDEX `payroll_component_lines_component_id_idx`(`component_id`),
    INDEX `payroll_component_lines_assignment_id_idx`(`assignment_id`),
    INDEX `payroll_component_lines_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `payroll_components` ADD CONSTRAINT `payroll_components_account_id_fkey` FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_payroll_components` ADD CONSTRAINT `employee_payroll_components_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `employee_payroll_components` ADD CONSTRAINT `employee_payroll_components_component_id_fkey` FOREIGN KEY (`component_id`) REFERENCES `payroll_components`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_component_lines` ADD CONSTRAINT `payroll_component_lines_payroll_id_fkey` FOREIGN KEY (`payroll_id`) REFERENCES `payrolls`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_component_lines` ADD CONSTRAINT `payroll_component_lines_component_id_fkey` FOREIGN KEY (`component_id`) REFERENCES `payroll_components`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll_component_lines` ADD CONSTRAINT `payroll_component_lines_assignment_id_fkey` FOREIGN KEY (`assignment_id`) REFERENCES `employee_payroll_components`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

