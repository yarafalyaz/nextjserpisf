-- Fase1 lead: FK yatim (B6) + tabel R3/R7 + kolom R4/R6.
-- Disalin dari DDL hasil `prisma db push` (kebenaran Prisma) agar verify drift 0.
-- Pre-existing drift ikut diperbaiki: purchase_requests.vendor_id FK.

-- B6: FK GoodsReceiptItem (index *_idx dibuat db push; constraint *_fkey).
ALTER TABLE `goods_receipt_items`
  ADD CONSTRAINT `goods_receipt_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `goods_receipt_items_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `goods_receipt_items_rack_id_fkey` FOREIGN KEY (`rack_id`) REFERENCES `racks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `goods_receipt_items_rack_row_id_fkey` FOREIGN KEY (`rack_row_id`) REFERENCES `rack_rows`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `goods_receipt_items_stock_move_id_fkey` FOREIGN KEY (`stock_move_id`) REFERENCES `stock_moves`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- B6: FK TaxGroupTax.taxId (KEY eksplisit agar nama index = DDL push).
ALTER TABLE `tax_group_taxes`
  ADD KEY `tax_group_taxes_tax_id_fkey` (`tax_id`),
  ADD CONSTRAINT `tax_group_taxes_tax_id_fkey` FOREIGN KEY (`tax_id`) REFERENCES `taxes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- B6: FK Transfer/Material/Invoice item.
ALTER TABLE `inventory_transfer_items`
  ADD CONSTRAINT `inventory_transfer_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `material_issue_items`
  ADD CONSTRAINT `material_issue_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sales_invoice_items`
  ADD CONSTRAINT `sales_invoice_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- Pre-existing drift: FK purchase_requests.vendor_id (ada di schema, hilang di rantai).
ALTER TABLE `purchase_requests`
  ADD CONSTRAINT `purchase_requests_vendor_id_fkey` FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- R3: tabel estimasi biaya job.
CREATE TABLE `work_order_cost_estimates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `work_order_id` int NOT NULL,
  `quotation_id` int DEFAULT NULL,
  `source` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'derived',
  `total_estimate` decimal(15,2) DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `locked_at` datetime(3) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  `labor_cost` decimal(15,2) DEFAULT NULL,
  `material_cost` decimal(15,2) DEFAULT NULL,
  `other_cost` decimal(15,2) DEFAULT NULL,
  `overhead_cost` decimal(15,2) DEFAULT NULL,
  `service_cost` decimal(15,2) DEFAULT NULL,
  `subcontract_cost` decimal(15,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `work_order_cost_estimates_work_order_id_key` (`work_order_id`),
  KEY `work_order_cost_estimates_quotation_id_idx` (`quotation_id`),
  CONSTRAINT `work_order_cost_estimates_quotation_id_fkey` FOREIGN KEY (`quotation_id`) REFERENCES `quotations` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `work_order_cost_estimates_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- R4: kolom jangkar tiket.
ALTER TABLE `crm_tickets`
  ADD COLUMN `customer_vehicle_id` int DEFAULT NULL,
  ADD COLUMN `work_order_id` int DEFAULT NULL,
  ADD COLUMN `sales_invoice_id` int DEFAULT NULL,
  ADD COLUMN `warranty_claim_id` int DEFAULT NULL,
  ADD KEY `crm_tickets_customer_vehicle_id_idx` (`customer_vehicle_id`),
  ADD KEY `crm_tickets_work_order_id_idx` (`work_order_id`),
  ADD KEY `crm_tickets_warranty_claim_id_idx` (`warranty_claim_id`),
  ADD KEY `crm_tickets_sales_invoice_id_idx` (`sales_invoice_id`),
  ADD CONSTRAINT `crm_tickets_customer_vehicle_id_fkey` FOREIGN KEY (`customer_vehicle_id`) REFERENCES `customer_vehicles` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `crm_tickets_sales_invoice_id_fkey` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `crm_tickets_warranty_claim_id_fkey` FOREIGN KEY (`warranty_claim_id`) REFERENCES `warranty_claims`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `crm_tickets_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- R6: kolom lembur WO.
ALTER TABLE `overtime_requests`
  ADD COLUMN `work_order_id` int DEFAULT NULL,
  ADD COLUMN `start_time` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `end_time` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `actual_start_time` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD COLUMN `actual_end_time` varchar(191) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  ADD KEY `overtime_requests_work_order_id_idx` (`work_order_id`),
  ADD CONSTRAINT `overtime_requests_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- R7: tabel roster.
CREATE TABLE `employee_rosters` (
  `id` int NOT NULL AUTO_INCREMENT,
  `employee_id` int NOT NULL,
  `date` date NOT NULL,
  `type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'draft',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `approved_by` int DEFAULT NULL,
  `approved_at` datetime(3) DEFAULT NULL,
  `created_by` int DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `employee_rosters_employee_id_date_type_key` (`employee_id`,`date`,`type`),
  KEY `employee_rosters_employee_id_idx` (`employee_id`),
  KEY `employee_rosters_date_idx` (`date`),
  CONSTRAINT `employee_rosters_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
