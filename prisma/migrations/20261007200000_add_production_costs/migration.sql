-- Non-material production costs (PRD FAB-06/07/08/09).
-- Direct labor, machine usage, applied overhead, and subcontract/service cost
-- lines that roll into the production order's actual cost so finished-goods HPP
-- is material + labor + overhead + subcontract, not material alone.

CREATE TABLE `production_costs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `production_order_id` int NULL,
  `work_order_id` int NULL,
  `category` varchar(191) NOT NULL DEFAULT 'labor',
  `description` text NULL,
  `hours` decimal(10,2) NULL,
  `rate` decimal(15,2) NULL,
  `amount` decimal(15,2) NOT NULL DEFAULT 0.00,
  `source_timesheet_id` int NULL,
  `vendor_id` int NULL,
  `reference_no` varchar(191) NULL,
  `posted_at` datetime(3) NULL,
  `created_by` int NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `production_costs_production_order_id_fkey` (`production_order_id`),
  KEY `production_costs_work_order_id_fkey` (`work_order_id`),
  KEY `production_costs_category_idx` (`category`),
  KEY `production_costs_vendor_id_idx` (`vendor_id`),
  KEY `production_costs_created_at_idx` (`created_at`),
  CONSTRAINT `production_costs_production_order_id_fkey` FOREIGN KEY (`production_order_id`) REFERENCES `production_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `production_costs_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `production_costs_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
