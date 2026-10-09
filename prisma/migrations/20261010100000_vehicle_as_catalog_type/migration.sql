-- Reorient the vehicle model: `vehicles` becomes the CATALOG TYPE master
-- (variant + year), while `customer_vehicles` holds the physical-unit
-- attributes (plate, color, chassis, engine) for each customer-owned unit.
--
-- This reverses the earlier `20261009100000_customer_vehicle_dedupe_plate_year_color`
-- decision that treated plate/year/color as physical-unit attributes living on
-- `vehicles`. The catalog-type framing makes `Vehicle` a reusable type under
-- `VehicleVariant`, so plate/color must live with the customer-owned unit.
--
-- Data may be reset in dev; still, preserve what we can by copying plate/color
-- back onto the owning customer_vehicles row before dropping the columns.

-- 1. Re-add physical-unit attributes on customer_vehicles.
ALTER TABLE `customer_vehicles` ADD COLUMN `plate_number` VARCHAR(191) NULL;
ALTER TABLE `customer_vehicles` ADD COLUMN `color` VARCHAR(191) NULL;
ALTER TABLE `customer_vehicles` ADD COLUMN `deleted_at` DATETIME(3) NULL;

-- 2. Backfill plate/color from the owning vehicle row (only when empty).
UPDATE `customer_vehicles` cv
JOIN `vehicles` v ON cv.`vehicle_id` = v.`id`
SET
  cv.`plate_number` = COALESCE(cv.`plate_number`, v.`plate_number`),
  cv.`color`        = COALESCE(cv.`color`, v.`color`)
WHERE
  (cv.`plate_number` IS NULL AND v.`plate_number` IS NOT NULL)
  OR (cv.`color` IS NULL AND v.`color` IS NOT NULL);

-- 3. Drop duplicate free-text columns now sourced from the catalog chain.
ALTER TABLE `customer_vehicles` DROP COLUMN `vehicle_type`;
ALTER TABLE `customer_vehicles` DROP COLUMN `transmission`;

-- 4. `vehicles` becomes the catalog type: variant is required, add name and
--    soft-delete, drop the physical-unit columns now owned by customer_vehicles.
--    Nullable variant rows cannot exist in the new shape; dev data may be reset.
DELETE FROM `vehicles` WHERE `vehicle_variant_id` IS NULL;
-- The existing FK is ON DELETE SET NULL, incompatible with a required variant.
-- A catalog type must always have a variant; deleting a variant that still has
-- types should be refused, so switch the FK to RESTRICT before tightening.
ALTER TABLE `vehicles` DROP FOREIGN KEY `vehicles_vehicle_variant_id_fkey`;
ALTER TABLE `vehicles` MODIFY `vehicle_variant_id` INTEGER NOT NULL;
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_vehicle_variant_id_fkey`
  FOREIGN KEY (`vehicle_variant_id`) REFERENCES `vehicle_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `vehicles` ADD COLUMN `name` VARCHAR(191) NULL;
ALTER TABLE `vehicles` ADD COLUMN `deleted_at` DATETIME(3) NULL;
ALTER TABLE `vehicles` DROP COLUMN `plate_number`;
ALTER TABLE `vehicles` DROP COLUMN `color`;

-- 5. Soft-delete indexes.
CREATE INDEX `vehicles_deleted_at_idx` ON `vehicles`(`deleted_at`);
CREATE INDEX `customer_vehicles_deleted_at_idx` ON `customer_vehicles`(`deleted_at`);

-- 6. customer_vehicles -> vehicles must no longer cascade: deleting a catalog
--    type must not silently wipe customer-owned units. Switch to RESTRICT.
ALTER TABLE `customer_vehicles` DROP FOREIGN KEY `customer_vehicles_vehicle_id_fkey`;
ALTER TABLE `customer_vehicles` ADD CONSTRAINT `customer_vehicles_vehicle_id_fkey`
  FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
