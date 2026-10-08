-- Per-line material lot/serial attribution (PRD line 369 / REP-13).
-- When material is issued to a production order, the FIFO consumption already
-- knows which serials (marked `used`) and batch lots it decremented. Persisting
-- them on the material line lets the production genealogy record, per emitted
-- unit, exactly which source serials/lots it was built from — completing
-- two-way traceability (source lot/serial → finished goods, and vice-versa).

ALTER TABLE `production_order_materials`
  ADD COLUMN `serial_numbers` JSON NULL AFTER `actual_cost`,
  ADD COLUMN `batch_numbers` JSON NULL AFTER `serial_numbers`;
