-- VEH-07 vehicle part/BOM fitment rules.
-- A rule scopes an item (SKU) — optionally a BOM revision — to a vehicle
-- configuration (brand/model/variant + year range + drivetrain + transmission)
-- and declares compatible / incompatible / unknown. The most specific matching
-- rule wins at evaluation; no match → unknown (needs technical verification).

CREATE TABLE `vehicle_fitment_rules` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `item_id` INT NOT NULL,
  `bom_revision_id` INT NULL,
  `vehicle_brand_id` INT NULL,
  `vehicle_model_id` INT NULL,
  `vehicle_variant_id` INT NULL,
  `year_from` INT NULL,
  `year_to` INT NULL,
  `drivetrain` VARCHAR(191) NULL,
  `transmission` VARCHAR(191) NULL,
  `result` VARCHAR(191) NOT NULL DEFAULT 'unknown',
  `source` TEXT NULL,
  `notes` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_by` INT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `vehicle_fitment_rules_item_id_idx` (`item_id`),
  INDEX `vehicle_fitment_rules_bom_revision_id_idx` (`bom_revision_id`),
  INDEX `vehicle_fitment_rules_vehicle_brand_id_idx` (`vehicle_brand_id`),
  INDEX `vehicle_fitment_rules_vehicle_model_id_idx` (`vehicle_model_id`),
  INDEX `vehicle_fitment_rules_vehicle_variant_id_idx` (`vehicle_variant_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
