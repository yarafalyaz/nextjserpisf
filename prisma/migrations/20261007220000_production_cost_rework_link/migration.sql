-- Link a non-material production cost line to the nonconformance (NCR) it was
-- auto-posted from, so a rework cost is mirrored exactly once per NCR and its
-- amount rolls into the production order's HPP (PRD FAB-11 + FAB-09).
--
-- `category` gains the 'rework' value on the application side (the column is a
-- plain varchar, so no DDL change is needed for the enum).

ALTER TABLE `production_costs`
  ADD COLUMN `nonconformance_id` int NULL AFTER `source_timesheet_id`;

ALTER TABLE `production_costs`
  ADD CONSTRAINT `production_costs_nonconformance_id_fkey`
    FOREIGN KEY (`nonconformance_id`) REFERENCES `nonconformances` (`id`)
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX `production_costs_nonconformance_id_unique`
  ON `production_costs` (`nonconformance_id`);
