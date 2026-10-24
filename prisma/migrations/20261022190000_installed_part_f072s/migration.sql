-- F-2026-10-22-072-S inti (induk F-2026-10-21-024): registri part
-- terpasang per kendaraan. Satu tabel aditif baru; tanpa backfill
-- (putusan BOT 1 Q-IP-4). Serial per-unit qty=1 + serialKey jangkar
-- unik (material_issue_item_id, serial_key) pola WarrantyCoverage.

-- CreateTable
CREATE TABLE `installed_parts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `customer_vehicle_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `material_issue_item_id` INTEGER NOT NULL,
    `serial_number` VARCHAR(191) NULL,
    `serial_key` VARCHAR(191) NOT NULL DEFAULT '',
    `qty` DECIMAL(15, 2) NOT NULL,
    `qty_removed` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `installed_at` DATETIME(3) NOT NULL,
    `warranty_coverage_id` INTEGER NULL,
    `removed_at` DATETIME(3) NULL,
    `removed_by` INTEGER NULL,
    `removal_reason` TEXT NULL,
    `replaced_by_installed_part_id` INTEGER NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `installed_parts_customer_vehicle_id_idx`(`customer_vehicle_id`),
    INDEX `installed_parts_item_id_idx`(`item_id`),
    INDEX `installed_parts_warranty_coverage_id_idx`(`warranty_coverage_id`),
    INDEX `installed_parts_replaced_by_installed_part_id_idx`(`replaced_by_installed_part_id`),
    UNIQUE INDEX `installed_parts_issue_item_serial_key_key`(`material_issue_item_id`, `serial_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `installed_parts` ADD CONSTRAINT `installed_parts_customer_vehicle_id_fkey` FOREIGN KEY (`customer_vehicle_id`) REFERENCES `customer_vehicles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `installed_parts` ADD CONSTRAINT `installed_parts_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `installed_parts` ADD CONSTRAINT `installed_parts_material_issue_item_id_fkey` FOREIGN KEY (`material_issue_item_id`) REFERENCES `material_issue_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `installed_parts` ADD CONSTRAINT `installed_parts_warranty_coverage_id_fkey` FOREIGN KEY (`warranty_coverage_id`) REFERENCES `warranty_coverages`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `installed_parts` ADD CONSTRAINT `installed_parts_replaced_by_installed_part_id_fkey` FOREIGN KEY (`replaced_by_installed_part_id`) REFERENCES `installed_parts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

