-- F-2026-10-22-078-S inti (induk F-2026-10-21-014): permintaan barang
-- antar gudang. Dua tabel aditif baru + satu kolom nullable di
-- inventory_transfers (Q-MR-4: tautan di sisi transfer). Tanpa backfill;
-- transfer existing material_request_id = NULL (transfer langsung sah).

-- AlterTable
ALTER TABLE `inventory_transfers` ADD COLUMN `material_request_id` INTEGER NULL;

-- CreateTable
CREATE TABLE `material_requests` (
    `slug` VARCHAR(191) NULL,
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `document_no` VARCHAR(191) NOT NULL,
    `requester_warehouse_id` INTEGER NOT NULL,
    `source_warehouse_id` INTEGER NOT NULL,
    `work_order_id` INTEGER NULL,
    `needed_by` DATETIME(3) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `rejection_reason` TEXT NULL,
    `approved_by` INTEGER NULL,
    `approved_at` DATETIME(3) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `material_requests_slug_key`(`slug`),
    UNIQUE INDEX `material_requests_document_no_key`(`document_no`),
    INDEX `idx_material_requests_status`(`status`),
    INDEX `material_requests_requester_warehouse_id_idx`(`requester_warehouse_id`),
    INDEX `material_requests_source_warehouse_id_idx`(`source_warehouse_id`),
    INDEX `material_requests_work_order_id_idx`(`work_order_id`),
    INDEX `material_requests_approved_by_idx`(`approved_by`),
    INDEX `material_requests_created_by_idx`(`created_by`),
    INDEX `material_requests_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `material_request_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `material_request_id` INTEGER NOT NULL,
    `item_id` INTEGER NOT NULL,
    `qty` DECIMAL(15, 2) NOT NULL,
    `notes` VARCHAR(191) NULL,

    INDEX `material_request_items_material_request_id_fkey`(`material_request_id`),
    INDEX `material_request_items_item_id_idx`(`item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `inventory_transfers_material_request_id_idx` ON `inventory_transfers`(`material_request_id`);

-- AddForeignKey
ALTER TABLE `material_requests` ADD CONSTRAINT `material_requests_requester_warehouse_id_fkey` FOREIGN KEY (`requester_warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_requests` ADD CONSTRAINT `material_requests_source_warehouse_id_fkey` FOREIGN KEY (`source_warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_requests` ADD CONSTRAINT `material_requests_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_request_items` ADD CONSTRAINT `material_request_items_material_request_id_fkey` FOREIGN KEY (`material_request_id`) REFERENCES `material_requests`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `material_request_items` ADD CONSTRAINT `material_request_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transfers` ADD CONSTRAINT `inventory_transfers_material_request_id_fkey` FOREIGN KEY (`material_request_id`) REFERENCES `material_requests`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
