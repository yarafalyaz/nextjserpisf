-- AlterTable
ALTER TABLE `work_order_operations` ADD COLUMN `work_center_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `work_centers` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `normalized_name` VARCHAR(191) NOT NULL,
    `capacity_hours_per_day` DECIMAL(15, 2) NOT NULL,
    `parallel_stations` INTEGER NOT NULL DEFAULT 1,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_by` INTEGER NULL,
    `updated_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `work_centers_normalized_name_is_active_idx`(`normalized_name`, `is_active`),
    INDEX `work_centers_is_active_sort_order_idx`(`is_active`, `sort_order`),
    INDEX `work_centers_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `work_order_operations_work_center_id_idx` ON `work_order_operations`(`work_center_id`);

-- AddForeignKey
ALTER TABLE `work_order_operations` ADD CONSTRAINT `work_order_operations_work_center_id_fkey` FOREIGN KEY (`work_center_id`) REFERENCES `work_centers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

