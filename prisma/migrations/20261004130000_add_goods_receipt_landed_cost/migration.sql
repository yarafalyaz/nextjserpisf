-- Landed cost: let each goods receipt record the ACTUAL freight/handling for
-- that shipment, instead of relying only on the PO's order-time estimate.
ALTER TABLE `goods_receipts` ADD COLUMN `shipping_cost` DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
ALTER TABLE `goods_receipts` ADD COLUMN `other_cost` DECIMAL(15, 2) NOT NULL DEFAULT 0.00;
