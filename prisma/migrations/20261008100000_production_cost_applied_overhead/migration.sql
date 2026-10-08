-- Driver-based applied overhead (PRD FAB-07 / REP-16).
-- Applied overhead = driver qty × rate (jam mesin, jam tenaga kerja, kuantitas,
-- atau SKF). The driver and its qty/rate are stored on the cost line for audit,
-- and `is_applied_overhead` lets the under/over-absorption report isolate
-- system-applied overhead from manual overhead entries.

ALTER TABLE `production_costs`
  ADD COLUMN `driver_type` varchar(32) NULL AFTER `amount`,
  ADD COLUMN `is_applied_overhead` tinyint(1) NOT NULL DEFAULT 0 AFTER `driver_type`;

CREATE INDEX `production_costs_is_applied_overhead_idx`
  ON `production_costs` (`is_applied_overhead`);
