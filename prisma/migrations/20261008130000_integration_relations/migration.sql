-- Structural integration fixes: restore missing cross-module relations that had
-- a foreign-key column but no Prisma relation, and add the WorkOrder ↔
-- ProductionOrder link so a production order can be tied to the job it fulfils
-- (replacing the fragile best-effort item matching on the detail page).

-- ProductionOrder → WorkOrder (SO/job drives production; also lets service-PO
-- cost roll into the right production HPP).
ALTER TABLE `production_orders` ADD COLUMN `work_order_id` INTEGER NULL;
CREATE INDEX `production_orders_work_order_id_idx` ON `production_orders`(`work_order_id`);
ALTER TABLE `production_orders` ADD CONSTRAINT `production_orders_work_order_id_fkey` FOREIGN KEY (`work_order_id`) REFERENCES `work_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- SalesReturn → SalesInvoice / Customer relations.
ALTER TABLE `sales_returns` ADD CONSTRAINT `sales_returns_sales_invoice_id_fkey` FOREIGN KEY (`sales_invoice_id`) REFERENCES `sales_invoices`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `sales_returns` ADD CONSTRAINT `sales_returns_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- VendorBill → GoodsReceipt relation.
ALTER TABLE `vendor_bills` ADD CONSTRAINT `vendor_bills_goods_receipt_id_fkey` FOREIGN KEY (`goods_receipt_id`) REFERENCES `goods_receipts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- VendorPaymentAllocation → VendorBill relation.
ALTER TABLE `vendor_payment_allocations` ADD CONSTRAINT `vendor_payment_allocations_vendor_bill_id_fkey` FOREIGN KEY (`vendor_bill_id`) REFERENCES `vendor_bills`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- VehicleFitmentRule → Item / BomRevision relations.
ALTER TABLE `vehicle_fitment_rules` ADD CONSTRAINT `vehicle_fitment_rules_item_id_fkey` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `vehicle_fitment_rules` ADD CONSTRAINT `vehicle_fitment_rules_bom_revision_id_fkey` FOREIGN KEY (`bom_revision_id`) REFERENCES `bom_revisions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
