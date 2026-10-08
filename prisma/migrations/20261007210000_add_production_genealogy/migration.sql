-- Production genealogy (PRD line 369 / REP-13).
-- Records, per production order completion, the finished unit (output item,
-- serials/lot, operator, unit/total cost) and the consumed materials with their
-- serials/lot, so finished goods can be traced to source lots and vice versa.

CREATE TABLE `production_genealogy` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_order_id` int NOT NULL,
  `document_no` varchar(191) NOT NULL,
  `output_item_id` int NOT NULL,
  `output_qty` decimal(15,2) NOT NULL,
  `output_serials` json NULL,
  `output_batch` varchar(191) NULL,
  `unit_cost` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_cost` decimal(15,2) NOT NULL DEFAULT 0.00,
  `completed_by` int NULL,
  `completed_at` datetime(3) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `production_genealogy_production_order_id_unique` (`production_order_id`),
  KEY `production_genealogy_output_item_id_fkey` (`output_item_id`),
  KEY `production_genealogy_document_no_idx` (`document_no`),
  KEY `production_genealogy_completed_at_idx` (`completed_at`),
  KEY `production_genealogy_created_at_idx` (`created_at`),
  CONSTRAINT `production_genealogy_production_order_id_fkey` FOREIGN KEY (`production_order_id`) REFERENCES `production_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `production_genealogy_materials` (
  `id` int NOT NULL AUTO_INCREMENT,
  `genealogy_id` int NOT NULL,
  `item_id` int NOT NULL,
  `qty` decimal(15,2) NOT NULL,
  `unit_cost` decimal(15,2) NOT NULL DEFAULT 0.00,
  `total_cost` decimal(15,2) NOT NULL DEFAULT 0.00,
  `serial_numbers` json NULL,
  `batch_number` varchar(191) NULL,
  PRIMARY KEY (`id`),
  KEY `production_genealogy_materials_genealogy_id_fkey` (`genealogy_id`),
  KEY `production_genealogy_materials_item_id_idx` (`item_id`),
  CONSTRAINT `production_genealogy_materials_genealogy_id_fkey` FOREIGN KEY (`genealogy_id`) REFERENCES `production_genealogy` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
