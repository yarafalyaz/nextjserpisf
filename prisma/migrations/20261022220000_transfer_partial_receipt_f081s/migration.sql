-- AlterTable
ALTER TABLE `stock_adjustments` ADD COLUMN `inventory_transfer_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `inventory_transfer_items` ADD COLUMN `received_qty` DECIMAL(15, 2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `inventory_transfer_receipts` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `inventory_transfer_id` INTEGER NOT NULL,
    `received_date` DATETIME(3) NOT NULL,
    `received_by` INTEGER NULL,
    `idempotency_key` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `inventory_transfer_receipts_idempotency_key_key`(`idempotency_key`),
    INDEX `inventory_transfer_receipts_inventory_transfer_id_idx`(`inventory_transfer_id`),
    INDEX `inventory_transfer_receipts_received_by_idx`(`received_by`),
    INDEX `inventory_transfer_receipts_received_date_idx`(`received_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory_transfer_receipt_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `receipt_id` INTEGER NOT NULL,
    `inventory_transfer_item_id` INTEGER NOT NULL,
    `qty` DECIMAL(15, 2) NOT NULL,
    `serial_numbers` JSON NULL,
    `batch_allocations` JSON NULL,

    INDEX `inventory_transfer_receipt_items_receipt_id_idx`(`receipt_id`),
    INDEX `inventory_transfer_receipt_items_inventory_transfer_item_id_idx`(`inventory_transfer_item_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `stock_adjustments_inventory_transfer_id_idx` ON `stock_adjustments`(`inventory_transfer_id`);

-- AddForeignKey
ALTER TABLE `stock_adjustments` ADD CONSTRAINT `stock_adjustments_inventory_transfer_id_fkey` FOREIGN KEY (`inventory_transfer_id`) REFERENCES `inventory_transfers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transfer_receipts` ADD CONSTRAINT `inventory_transfer_receipts_inventory_transfer_id_fkey` FOREIGN KEY (`inventory_transfer_id`) REFERENCES `inventory_transfers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transfer_receipt_items` ADD CONSTRAINT `inventory_transfer_receipt_items_receipt_id_fkey` FOREIGN KEY (`receipt_id`) REFERENCES `inventory_transfer_receipts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory_transfer_receipt_items` ADD CONSTRAINT `inventory_transfer_receipt_items_inventory_transfer_item_id_fkey` FOREIGN KEY (`inventory_transfer_item_id`) REFERENCES `inventory_transfer_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- F-2026-10-22-081-S backfill: transfer lama berstatus received sudah
-- diterima penuh oleh perilaku all-or-nothing pra-fitur; receivedQty
-- efektif = qty (spec §2 — ditulis eksplisit di migrasi, bukan diam-diam
-- oleh aplikasi). Transfer processed/parsial tidak disentuh (sisa sah).
UPDATE `inventory_transfer_items` `iti`
JOIN `inventory_transfers` `it` ON `it`.`id` = `iti`.`inventory_transfer_id`
SET `iti`.`received_qty` = `iti`.`qty`
WHERE `it`.`status` = 'received';
