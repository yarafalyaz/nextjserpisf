-- QC / inspection / NCR (PRD FAB-10, FAB-11, FAB-13).
-- Versioned master checklists, inspection events against a document, per-item
-- results, and nonconformance / rework records that block handover until closed.

CREATE TABLE `qc_checklists` (
  `id` int NOT NULL AUTO_INCREMENT,
  `code` varchar(191) NULL,
  `name` varchar(191) NOT NULL,
  `checklist_type` varchar(191) NOT NULL,
  `product_id` int NULL,
  `version` int NOT NULL DEFAULT 1,
  `status` varchar(191) NOT NULL DEFAULT 'draft',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `released_at` datetime(3) NULL,
  `released_by` int NULL,
  `created_by` int NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `qc_checklists_code_key` (`code`),
  KEY `qc_checklists_product_id_fkey` (`product_id`),
  KEY `qc_checklists_checklist_type_idx` (`checklist_type`),
  KEY `qc_checklists_status_idx` (`status`),
  KEY `qc_checklists_is_active_idx` (`is_active`),
  KEY `qc_checklists_created_at_idx` (`created_at`),
  CONSTRAINT `qc_checklists_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `qc_checklist_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `checklist_id` int NOT NULL,
  `sort_order` int NOT NULL DEFAULT 0,
  `item_name` varchar(191) NOT NULL,
  `method` varchar(191) NOT NULL DEFAULT 'visual',
  `spec` varchar(191) NULL,
  `is_required` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `qc_checklist_items_checklist_id_fkey` (`checklist_id`),
  KEY `qc_checklist_items_created_at_idx` (`created_at`),
  CONSTRAINT `qc_checklist_items_checklist_id_fkey` FOREIGN KEY (`checklist_id`) REFERENCES `qc_checklists` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `qc_inspections` (
  `id` int NOT NULL AUTO_INCREMENT,
  `document_no` varchar(191) NOT NULL,
  `checklist_id` int NOT NULL,
  `inspection_type` varchar(191) NOT NULL,
  `reference_type` varchar(191) NOT NULL,
  `reference_id` int NOT NULL,
  `status` varchar(191) NOT NULL DEFAULT 'draft',
  `inspector_id` int NULL,
  `inspected_at` datetime(3) NULL,
  `notes` text NULL,
  `created_by` int NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `qc_inspections_document_no_key` (`document_no`),
  KEY `qc_inspections_checklist_id_fkey` (`checklist_id`),
  KEY `qc_inspections_reference_idx` (`reference_type`, `reference_id`),
  KEY `qc_inspections_status_idx` (`status`),
  KEY `qc_inspections_inspection_type_idx` (`inspection_type`),
  KEY `qc_inspections_created_by_idx` (`created_by`),
  KEY `qc_inspections_created_at_idx` (`created_at`),
  CONSTRAINT `qc_inspections_checklist_id_fkey` FOREIGN KEY (`checklist_id`) REFERENCES `qc_checklists` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `qc_inspection_results` (
  `id` int NOT NULL AUTO_INCREMENT,
  `inspection_id` int NOT NULL,
  `checklist_item_id` int NOT NULL,
  `result` varchar(191) NOT NULL DEFAULT 'na',
  `measured_value` varchar(191) NULL,
  `notes` text NULL,
  PRIMARY KEY (`id`),
  KEY `qc_inspection_results_inspection_id_fkey` (`inspection_id`),
  KEY `qc_inspection_results_checklist_item_id_idx` (`checklist_item_id`),
  CONSTRAINT `qc_inspection_results_inspection_id_fkey` FOREIGN KEY (`inspection_id`) REFERENCES `qc_inspections` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `qc_inspection_results_checklist_item_id_fkey` FOREIGN KEY (`checklist_item_id`) REFERENCES `qc_checklist_items` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `nonconformances` (
  `id` int NOT NULL AUTO_INCREMENT,
  `document_no` varchar(191) NOT NULL,
  `inspection_id` int NULL,
  `reference_type` varchar(191) NOT NULL,
  `reference_id` int NOT NULL,
  `defect_description` text NOT NULL,
  `cause` text NULL,
  `responsibility` varchar(191) NOT NULL DEFAULT 'internal',
  `severity` varchar(191) NOT NULL DEFAULT 'minor',
  `status` varchar(191) NOT NULL DEFAULT 'open',
  `rework_cost` decimal(15,2) NOT NULL DEFAULT 0.00,
  `rework_hours` decimal(10,2) NOT NULL DEFAULT 0.00,
  `resolution` text NULL,
  `closed_by` int NULL,
  `closed_at` datetime(3) NULL,
  `created_by` int NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `nonconformances_document_no_key` (`document_no`),
  KEY `nonconformances_inspection_id_fkey` (`inspection_id`),
  KEY `nonconformances_reference_idx` (`reference_type`, `reference_id`),
  KEY `nonconformances_status_idx` (`status`),
  KEY `nonconformances_created_at_idx` (`created_at`),
  CONSTRAINT `nonconformances_inspection_id_fkey` FOREIGN KEY (`inspection_id`) REFERENCES `qc_inspections` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
