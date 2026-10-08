-- Service purchase order foundation (PRD FAB-08 / PUR-17).
-- A "service" PO buys labour/subcontract (coating, machining, laser cutting)
-- rather than stock. Its GRN records the cost and posts an expense journal, but
-- creates NO stock move / FIFO layer / batch / serial — the vendor does not move
-- the workshop's inventory.
--
--  * items.is_service          — master flag marking a non-stock service item.
--  * purchase_orders.is_service — the PO buys services (skips stock movement on GRN).
--  * purchase_orders.work_order_id — optional link to the job the service is for.
--  * production_costs.purchase_order_id — traceability from a service/subcontract
--    cost line back to the PO it came from (HPP roll-up, FAB-09).

ALTER TABLE `items`
  ADD COLUMN `is_service` tinyint(1) NOT NULL DEFAULT 0 AFTER `is_product`;

ALTER TABLE `purchase_orders`
  ADD COLUMN `work_order_id` int NULL AFTER `purchase_request_id`,
  ADD COLUMN `is_service` tinyint(1) NOT NULL DEFAULT 0 AFTER `work_order_id`;

ALTER TABLE `purchase_orders`
  ADD CONSTRAINT `purchase_orders_work_order_id_fkey`
    FOREIGN KEY (`work_order_id`) REFERENCES `work_orders` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `purchase_orders_work_order_id_fkey`
  ON `purchase_orders` (`work_order_id`);

ALTER TABLE `production_costs`
  ADD COLUMN `purchase_order_id` int NULL AFTER `nonconformance_id`;

ALTER TABLE `production_costs`
  ADD CONSTRAINT `production_costs_purchase_order_id_fkey`
    FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_orders` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX `production_costs_purchase_order_id_fkey`
  ON `production_costs` (`purchase_order_id`);
