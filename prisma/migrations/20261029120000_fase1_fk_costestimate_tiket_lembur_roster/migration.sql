-- Fase1 lead: FK fisik yatim (B6) + tabel R3/R7 + kolom R4/R6.
-- Alter kolom existing diasumsikan NULL-able (kolom baru semua nullable).

-- B6: FK GoodsReceiptItem -> item/warehouse/rack/rackRow/stockMove
ALTER TABLE `goods_receipt_items`
  ADD CONSTRAINT `goods_receipt_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `goods_receipt_items_warehouse_id_fkey` FOREIGN KEY (`warehouse_id`) REFERENCES `warehouses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `goods_receipt_items_rack_id_fkey` FOREIGN KEY (`rack_id`) REFERENCES `racks`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `goods_receipt_items_rack_row_id_fkey` FOREIGN KEY (`rack_row_id`) REFERENCES `rack_rows`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT `goods_receipt_items_stock_move_id_fkey` FOREIGN KEY (`stock_move_id`) REFERENCES `stock_moves`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- B6: FK TaxGroupTax -> tax
ALTER TABLE `tax_group_taxes`
  ADD CONSTRAINT `tax_group_taxes_tax_id_fkey` FOREIGN KEY (`tax_id`) REFERENCES `taxes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- B6: FK InventoryTransferItem / MaterialIssueItem -> item; SalesInvoiceItem SetNull
ALTER TABLE `inventory_transfer_items`
  ADD CONSTRAINT `inventory_transfer_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `material_issue_items`
  ADD CONSTRAINT `material_issue_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `sales_invoice_items`
  ADD CONSTRAINT `sales_invoice_items_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- R3: tabel estimasi biaya job
CREATE TABLE `work_order_cost_estimates` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `work_order_id` INTEGER NOT NULL,
  `quotation_id` INTEGER NULL,
  `source` VARCHAR(32) NOT NULL DEFAULT 'derived',
  `material_cost` DECIMAL(15, 2) NULL,
  `labor_cost` DECIMAL(15, 2) NULL,
  `overhead_cost` DECIMAL(15, 2) NULL,
  `service_cost` DECIMAL(15, 2) NULL,
  `subcontract_cost` DECIMAL(15, 2) NULL,
  `other_cost` DECIMAL(15, 2) NULL,
  `total_estimate` DECIMAL(15, 2) NULL,
  `notes` TEXT NULL,
  `locked_at` DATETIME(3) NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `work_order_cost_estimates_work_order_id_key`(`work_order_id`),
  INDEX `work_order_cost_estimates_quotation_id_idx`(`quotation_id`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `work_order_cost_estimates`
  ADD CONSTRAINT `work_order_cost_estimates_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT `work_order_cost_estimates_quotation_id_fkey` FOREIGN KEY (`quotation_id`) REFERENCES `quotations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- R4: kolom jangkar tiket
ALTER TABLE `crm_tickets`
  ADD COLUMN `customer_vehicle_id` INTEGER NULL,
  ADD COLUMN `work_order_id` INTEGER NULL,
  ADD COLUMN `sales_invoice_id` INTEGER NULL,
  ADD COLUMN `warranty_claim_id` INTEGER NULL,
  ADD CONSTRAINT `crm_tickets_customer_vehicle_id_fkey` FOREIGN KEY (`customer_vehicle_id`) REFERENCES `customer_vehicles`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `crm_tickets_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `crm_tickets_sales_invoice_id_fkey` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT `crm_tickets_warranty_claim_id_fkey` FOREIGN KEY (`warranty_claim_id`) REFERENCES `warranty_claims`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `crm_tickets_customer_vehicle_id_idx` ON `crm_tickets`(`customer_vehicle_id`);
CREATE INDEX `crm_tickets_work_order_id_idx` ON `crm_tickets`(`work_order_id`);
CREATE INDEX `crm_tickets_warranty_claim_id_idx` ON `crm_tickets`(`warranty_claim_id`);

-- R6: kolom lembur WO
ALTER TABLE `overtime_requests`
  ADD COLUMN `work_order_id` INTEGER NULL,
  ADD COLUMN `start_time` DATETIME(3) NULL,
  ADD COLUMN `end_time` DATETIME(3) NULL,
  ADD COLUMN `actual_start_time` DATETIME(3) NULL,
  ADD COLUMN `actual_end_time` DATETIME(3) NULL,
  ADD CONSTRAINT `overtime_requests_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX `overtime_requests_work_order_id_idx` ON `overtime_requests`(`work_order_id`);

-- R7: tabel roster
CREATE TABLE `employee_rosters` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `employee_id` INTEGER NOT NULL,
  `date` DATE NOT NULL,
  `type` VARCHAR(32) NOT NULL,
  `status` VARCHAR(16) NOT NULL DEFAULT 'draft',
  `notes` TEXT NULL,
  `approved_by` INTEGER NULL,
  `approved_at` DATETIME(3) NULL,
  `created_by` INTEGER NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  UNIQUE INDEX `uq_roster_employee_date_type`(`employee_id`, `date`, `type`),
  INDEX `employee_rosters_employee_date_idx`(`employee_id`, `date`),
  INDEX `employee_rosters_date_status_idx`(`date`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `employee_rosters`
  ADD CONSTRAINT `employee_rosters_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
