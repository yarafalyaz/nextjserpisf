-- Add foreign keys for the vehicle scope on vehicle_fitment_rules.
--
-- vehicle_brand_id / vehicle_model_id / vehicle_variant_id were plain Int
-- columns: a fitment rule could reference a brand/model/variant that had since
-- been deleted, and deleting a catalog entry left the rule's scope dangling.
-- The unique constraint name on `vehicle_models` is long, so MySQL's generated
-- FK name would exceed the 64-char limit — name them explicitly.
--
-- ON DELETE SET NULL (not CASCADE): removing a catalog entry turns that scope
-- dimension into a wildcard instead of silently deleting the technical rule.
-- The table is empty in every environment, so no backfill is required, but the
-- pre-clean keeps the ADD CONSTRAINT safe if a stray row exists.
UPDATE `vehicle_fitment_rules` r
LEFT JOIN `vehicle_brands` b   ON b.`id` = r.`vehicle_brand_id`
LEFT JOIN `vehicle_models` m   ON m.`id` = r.`vehicle_model_id`
LEFT JOIN `vehicle_variants` v ON v.`id` = r.`vehicle_variant_id`
SET
  r.`vehicle_brand_id`   = IF(b.`id` IS NULL, NULL, r.`vehicle_brand_id`),
  r.`vehicle_model_id`   = IF(m.`id` IS NULL, NULL, r.`vehicle_model_id`),
  r.`vehicle_variant_id` = IF(v.`id` IS NULL, NULL, r.`vehicle_variant_id`);

ALTER TABLE `vehicle_fitment_rules`
  ADD CONSTRAINT `vehicle_fitment_rules_brand_fkey`
    FOREIGN KEY (`vehicle_brand_id`) REFERENCES `vehicle_brands`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `vehicle_fitment_rules`
  ADD CONSTRAINT `vehicle_fitment_rules_model_fkey`
    FOREIGN KEY (`vehicle_model_id`) REFERENCES `vehicle_models`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE `vehicle_fitment_rules`
  ADD CONSTRAINT `vehicle_fitment_rules_variant_fkey`
    FOREIGN KEY (`vehicle_variant_id`) REFERENCES `vehicle_variants`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
