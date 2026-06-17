-- Additive parity columns (YaraERP parity). All nullable or defaulted → no data loss.
ALTER TABLE `banks` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'bank';
ALTER TABLE `payrolls` ADD COLUMN `type` VARCHAR(191) NOT NULL DEFAULT 'REGULAR';
ALTER TABLE `holidays` ADD COLUMN `is_national_holiday` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `goods_receipts` ADD COLUMN `reference_number` VARCHAR(191) NULL;
ALTER TABLE `customers` ADD COLUMN `tax_id` VARCHAR(191) NULL;
ALTER TABLE `positions` ADD COLUMN `description` TEXT NULL;
ALTER TABLE `brands` ADD COLUMN `description` TEXT NULL;
