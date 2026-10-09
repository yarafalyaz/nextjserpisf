-- Deduplicate vehicle identity fields.
--
-- plate/year/color describe the PHYSICAL unit, so they belong on `vehicles`
-- (one row per physical unit, pointed at the shared brand/model/variant
-- catalog). `customer_vehicles` is only the ownership link between a customer
-- and a unit — copy-holding plate/year/color there allowed the two copies to
-- drift. Backfill any value the link still carries into its Vehicle row (only
-- when the Vehicle side is NULL, so an existing authoritative value wins), then
-- drop the three columns.

UPDATE `vehicles` v
JOIN `customer_vehicles` cv ON cv.`vehicle_id` = v.`id`
SET
  v.`plate_number` = COALESCE(v.`plate_number`, cv.`license_plate`),
  v.`year`         = COALESCE(v.`year`, cv.`year`),
  v.`color`        = COALESCE(v.`color`, cv.`color`)
WHERE
  (v.`plate_number` IS NULL AND cv.`license_plate` IS NOT NULL)
  OR (v.`year` IS NULL AND cv.`year` IS NOT NULL)
  OR (v.`color` IS NULL AND cv.`color` IS NOT NULL);

ALTER TABLE `customer_vehicles` DROP COLUMN `license_plate`;
ALTER TABLE `customer_vehicles` DROP COLUMN `year`;
ALTER TABLE `customer_vehicles` DROP COLUMN `color`;
