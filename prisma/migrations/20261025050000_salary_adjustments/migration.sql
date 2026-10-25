-- HCMS riwayat kenaikan gaji: catatan bertanggal efektif atas
-- employees.base_salary. Yang sudah lewat diterapkan seketika; yang
-- terjadwal diterapkan jalur pembuatan slip saat jatuh tempo.

-- CreateTable
CREATE TABLE `salary_adjustments` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `employee_id` INTEGER NOT NULL,
    `effective_date` DATETIME(3) NOT NULL,
    `previous_base_salary` DECIMAL(15, 2) NOT NULL,
    `new_base_salary` DECIMAL(15, 2) NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'scheduled',
    `applied_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `salary_adjustments_employee_id_fkey`(`employee_id`),
    INDEX `idx_salary_adjustments_due`(`status`, `effective_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `salary_adjustments` ADD CONSTRAINT `salary_adjustments_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
