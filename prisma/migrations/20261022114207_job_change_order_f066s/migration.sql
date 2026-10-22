-- CreateTable
CREATE TABLE `job_change_orders` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `slug` VARCHAR(191) NULL,
    `document_no` VARCHAR(191) NOT NULL,
    `sequence` INTEGER NOT NULL,
    `work_order_id` INTEGER NOT NULL,
    `quotation_id` INTEGER NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'draft',
    `reason` TEXT NOT NULL,
    `sent_at` DATETIME(3) NULL,
    `sent_by` INTEGER NULL,
    `selisih_nilai` DECIMAL(15, 2) NULL,
    `grand_total_sebelum` DECIMAL(15, 2) NULL,
    `grand_total_sesudah` DECIMAL(15, 2) NULL,
    `approval_reference` TEXT NULL,
    `disetujui_oleh_pelanggan_at` DATETIME(3) NULL,
    `disetujui_dicatat_oleh` INTEGER NULL,
    `approval_attachment_url` VARCHAR(191) NULL,
    `rejection_reason` TEXT NULL,
    `rejected_at` DATETIME(3) NULL,
    `rejected_by` INTEGER NULL,
    `cancel_reason` TEXT NULL,
    `cancelled_at` DATETIME(3) NULL,
    `cancelled_by` INTEGER NULL,
    `applied_at` DATETIME(3) NULL,
    `applied_by` INTEGER NULL,
    `applied_grand_total` DECIMAL(15, 2) NULL,
    `applied_invoice_id` INTEGER NULL,
    `applied_credit_id` INTEGER NULL,
    `applied_note` TEXT NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `job_change_orders_slug_key`(`slug`),
    UNIQUE INDEX `job_change_orders_document_no_key`(`document_no`),
    INDEX `job_change_orders_work_order_id_status_idx`(`work_order_id`, `status`),
    INDEX `job_change_orders_quotation_id_idx`(`quotation_id`),
    INDEX `job_change_orders_status_idx`(`status`),
    INDEX `job_change_orders_created_by_idx`(`created_by`),
    INDEX `job_change_orders_created_at_idx`(`created_at`),
    UNIQUE INDEX `job_change_orders_wo_sequence_unique`(`work_order_id`, `sequence`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `job_change_order_items` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `change_order_id` INTEGER NOT NULL,
    `work_order_item_id` INTEGER NULL,
    `itemId` INTEGER NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `uom` VARCHAR(191) NULL,
    `qty_before` DECIMAL(15, 2) NULL,
    `qty_after` DECIMAL(15, 2) NULL,
    `cost_before` DECIMAL(15, 2) NULL,
    `cost_after` DECIMAL(15, 2) NULL,
    `unit_price_before` DECIMAL(15, 2) NULL,
    `unit_price_after` DECIMAL(15, 2) NULL,
    `discount_before` DECIMAL(15, 2) NULL,
    `discount_after` DECIMAL(15, 2) NULL,
    `discount_type` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `job_change_order_items_change_order_id_idx`(`change_order_id`),
    INDEX `job_change_order_items_work_order_item_id_idx`(`work_order_item_id`),
    INDEX `job_change_order_items_itemId_idx`(`itemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `job_change_orders` ADD CONSTRAINT `job_change_orders_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_change_orders` ADD CONSTRAINT `job_change_orders_quotation_id_fkey` FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_change_order_items` ADD CONSTRAINT `job_change_order_items_change_order_id_fkey` FOREIGN KEY (`change_order_id`) REFERENCES `job_change_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_change_order_items` ADD CONSTRAINT `job_change_order_items_work_order_item_id_fkey` FOREIGN KEY (`work_order_item_id`) REFERENCES `work_order_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

