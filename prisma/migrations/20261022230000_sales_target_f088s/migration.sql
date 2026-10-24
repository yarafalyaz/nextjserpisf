-- CreateTable
CREATE TABLE `sales_targets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sales_employee_id` INTEGER NOT NULL,
    `period_start` DATETIME(3) NOT NULL,
    `period_end` DATETIME(3) NOT NULL,
    `target_amount` DECIMAL(15, 2) NOT NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sales_targets_sales_employee_id_period_start_period_end_idx`(`sales_employee_id`, `period_start`, `period_end`),
    INDEX `sales_targets_deleted_at_idx`(`deleted_at`),
    INDEX `sales_targets_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sales_targets` ADD CONSTRAINT `sales_targets_sales_employee_id_fkey` FOREIGN KEY (`sales_employee_id`) REFERENCES `employees`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
