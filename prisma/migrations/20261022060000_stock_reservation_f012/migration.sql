-- F-2026-10-21-012 inti (spec F-2026-10-22-045-S, vonis Lead F-045-S):
-- ikatan qty stok per (WO, baris WO, gudang). Tabel baru aditif, tanpa
-- backfill: reservasi hanya lahir di startWorkOrder sesudah migrasi ini.
-- qty Decimal(15,2) pola repo; status String pola repo
-- (active | consumed | released | expired).

-- CreateTable
CREATE TABLE `stock_reservations` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `work_order_id` INTEGER NOT NULL,
    `work_order_item_id` INTEGER NULL,
    `item_id` INTEGER NOT NULL,
    `warehouse_id` INTEGER NOT NULL,
    `qty_reserved` DECIMAL(15, 2) NOT NULL,
    `qty_consumed` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `status` VARCHAR(191) NOT NULL DEFAULT 'active',
    `shortage_qty` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    `expires_at` DATETIME(3) NULL,
    `released_at` DATETIME(3) NULL,
    `released_by` INTEGER NULL,
    `release_reason` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `stock_reservations_work_order_id_status_idx`(`work_order_id`, `status`),
    INDEX `stock_reservations_item_id_warehouse_id_status_idx`(`item_id`, `warehouse_id`, `status`),
    INDEX `stock_reservations_work_order_id_item_id_warehouse_id_status_idx`(`work_order_id`, `item_id`, `warehouse_id`, `status`),
    INDEX `stock_reservations_expires_at_idx`(`expires_at`),
    INDEX `stock_reservations_work_order_item_id_idx`(`work_order_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `stock_reservations` ADD CONSTRAINT `stock_reservations_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_reservations` ADD CONSTRAINT `stock_reservations_work_order_item_id_fkey` FOREIGN KEY (`work_order_item_id`) REFERENCES `work_order_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_reservations` ADD CONSTRAINT `stock_reservations_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stock_reservations` ADD CONSTRAINT `stock_reservations_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
