-- BOM revision + snapshot (PRD FAB-02 / MOD-04).
-- Versioned, immutable-on-release BOM header per product, its frozen lines,
-- and the revision pins carried by production/work orders.

CREATE TABLE `bom_revisions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `product_id` int NOT NULL,
  `revision_no` int NOT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'draft',
  `effective_date` datetime(3) NOT NULL,
  `notes` text NULL,
  `released_at` datetime(3) NULL,
  `released_by` int NULL,
  `created_by` int NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bom_revisions_product_revision_unique` (`product_id`, `revision_no`),
  KEY `bom_revisions_product_id_fkey` (`product_id`),
  KEY `bom_revisions_status_idx` (`status`),
  KEY `bom_revisions_created_by_idx` (`created_by`),
  KEY `bom_revisions_created_at_idx` (`created_at`),
  CONSTRAINT `bom_revisions_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `bom_revision_materials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `bom_revision_id` int NOT NULL,
  `item_id` int NOT NULL,
  `qty` decimal(15,2) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `bom_revision_materials_bom_revision_id_fkey` (`bom_revision_id`),
  KEY `bom_revision_materials_item_id_idx` (`item_id`),
  CONSTRAINT `bom_revision_materials_bom_revision_id_fkey` FOREIGN KEY (`bom_revision_id`) REFERENCES `bom_revisions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `production_orders` ADD COLUMN `bom_revision_id` int NULL;
ALTER TABLE `production_orders` ADD KEY `production_orders_bom_revision_id_idx` (`bom_revision_id`);
ALTER TABLE `production_orders` ADD CONSTRAINT `production_orders_bom_revision_id_fkey` FOREIGN KEY (`bom_revision_id`) REFERENCES `bom_revisions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `work_orders` ADD COLUMN `bom_revision_id` int NULL;
ALTER TABLE `work_orders` ADD KEY `work_orders_bom_revision_id_idx` (`bom_revision_id`);
ALTER TABLE `work_orders` ADD CONSTRAINT `work_orders_bom_revision_id_fkey` FOREIGN KEY (`bom_revision_id`) REFERENCES `bom_revisions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
