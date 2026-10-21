-- F-2026-10-21-021 tahap 1-2: garansi pasang tercatat.
-- items.warranty_months (nullable) + customer_vehicles.last_odometer_km,
-- tabel warranty_coverages (lahir otomatis saat WO completed) dan
-- warranty_claims (state machine manual, TANPA jurnal/provisi).
-- Kolom/tabel baru semua nullable/default aman untuk baris lama.

-- AlterTable
ALTER TABLE `items` ADD COLUMN `warranty_months` INTEGER NULL;

-- AlterTable
ALTER TABLE `customer_vehicles` ADD COLUMN `last_odometer_km` INTEGER NULL;

-- CreateTable
CREATE TABLE `warranty_coverages` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_vehicle_id` INTEGER NOT NULL,
    `work_order_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `serial_number` VARCHAR(191) NULL,
    `installed_at` DATETIME(3) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `warranty_months` INTEGER NOT NULL,
    `mileage_limit_km` INTEGER NULL,
    `terms_snapshot` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `warranty_coverages_customer_vehicle_id_idx`(`customer_vehicle_id`),
    INDEX `warranty_coverages_work_order_id_idx`(`work_order_id`),
    INDEX `warranty_coverages_item_id_idx`(`item_id`),
    INDEX `warranty_coverages_status_idx`(`status`),
    INDEX `warranty_coverages_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warranty_claims` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `coverage_id` INTEGER NOT NULL,
    `customer_vehicle_id` INTEGER NOT NULL,
    `reported_at` DATETIME(3) NOT NULL,
    `odometer_km` INTEGER NULL,
    `complaint` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'intake',
    `decision_by` INTEGER NULL,
    `decision_at` DATETIME(3) NULL,
    `decision_notes` TEXT NULL,
    `resolution_type` VARCHAR(191) NULL,
    `repair_work_order_id` INTEGER NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `warranty_claims_coverage_id_idx`(`coverage_id`),
    INDEX `warranty_claims_customer_vehicle_id_idx`(`customer_vehicle_id`),
    INDEX `warranty_claims_status_idx`(`status`),
    INDEX `warranty_claims_repair_work_order_id_idx`(`repair_work_order_id`),
    INDEX `warranty_claims_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `warranty_coverages` ADD CONSTRAINT `warranty_coverages_customer_vehicle_id_fkey` FOREIGN KEY (`customer_vehicle_id`) REFERENCES `customer_vehicles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranty_coverages` ADD CONSTRAINT `warranty_coverages_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranty_coverages` ADD CONSTRAINT `warranty_coverages_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_coverage_id_fkey` FOREIGN KEY (`coverage_id`) REFERENCES `warranty_coverages`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_customer_vehicle_id_fkey` FOREIGN KEY (`customer_vehicle_id`) REFERENCES `customer_vehicles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warranty_claims` ADD CONSTRAINT `warranty_claims_repair_work_order_id_fkey` FOREIGN KEY (`repair_work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

