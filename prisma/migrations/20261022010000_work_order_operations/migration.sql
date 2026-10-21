-- F-2026-10-21-020 Tahap A (vonis Lead Q1-Q5): tahap progres perintah
-- kerja ringan tanpa WorkCenter. Tabel baru + 1 kolom setting aditif,
-- tanpa backfill: WO lama tetap nol baris tahap ("tanpa tahap tercatat"),
-- dilarang mengarang progres retroaktif. Tahap bukan routing costing:
-- tanpa kolom biaya, tanpa jurnal, tanpa ProductionCost baru.

-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `default_work_order_stages` VARCHAR(1000) NOT NULL DEFAULT 'Persiapan, Pengerjaan, Quality Check, Selesai';

-- CreateTable
CREATE TABLE `work_order_operations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `work_order_id` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `status` VARCHAR(191) NOT NULL DEFAULT 'pending',
    `estimated_hours` DECIMAL(15, 2) NULL,
    `assigned_employee_id` INTEGER NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `work_order_operations_work_order_id_fkey`(`work_order_id`),
    INDEX `work_order_operations_wo_sort_idx`(`work_order_id`, `sort_order`),
    INDEX `work_order_operations_status_idx`(`status`),
    INDEX `work_order_operations_assigned_employee_id_idx`(`assigned_employee_id`),
    INDEX `work_order_operations_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `work_order_operations` ADD CONSTRAINT `work_order_operations_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `work_order_operations` ADD CONSTRAINT `work_order_operations_assigned_employee_id_fkey` FOREIGN KEY (`assigned_employee_id`) REFERENCES `employees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
