-- Partial completion / WIP per equivalent (PRD FAB-09).
-- A production order can release finished units to stock in more than one step.
-- `completed_qty` accumulates what has been received so far; the order stays
-- `in_progress` until `completed_qty` reaches `qty`, and each release carries its
-- equivalent share of cost (the remainder stays as WIP on the order).

ALTER TABLE `production_orders`
  ADD COLUMN `completed_qty` DECIMAL(15, 2) NOT NULL DEFAULT 0.00 AFTER `total_actual_cost`;
