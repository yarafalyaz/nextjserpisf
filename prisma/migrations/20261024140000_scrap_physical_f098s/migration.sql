-- F-2026-10-24-098-S: inti allowance & klasifikasi fisik scrap plat/profil.
-- Aditif saja: kolom nullable baru, tanpa backfill, tanpa ubah baris lama.
-- Baris lama: material_shape/remnant_min_measure/scrap_allowance_note NULL =
-- belum ditetapkan kepala bengkel (BR-SCRAP-02/05); scrap_review_* NULL =
-- belum masuk antrean tinjau; scrap_weight_kg NULL sampai transisi scrap.

ALTER TABLE `item_categories`
  ADD COLUMN `material_shape` VARCHAR(32) NULL,
  ADD COLUMN `remnant_min_measure` DECIMAL(15, 2) NULL,
  ADD COLUMN `scrap_allowance_note` VARCHAR(500) NULL;

ALTER TABLE `remnants`
  ADD COLUMN `remnant_min_measure_snapshot` DECIMAL(15, 2) NULL,
  ADD COLUMN `measured_size` DECIMAL(15, 2) NULL,
  ADD COLUMN `scrap_weight_kg` DECIMAL(15, 2) NULL;

ALTER TABLE `material_issue_items`
  ADD COLUMN `scrap_review_status` VARCHAR(32) NULL,
  ADD COLUMN `scrap_review_disposition` VARCHAR(32) NULL,
  ADD COLUMN `scrap_review_note` VARCHAR(500) NULL,
  ADD COLUMN `scrap_reviewed_by` INTEGER NULL,
  ADD COLUMN `scrap_reviewed_at` DATETIME(3) NULL;

ALTER TABLE `production_order_materials`
  ADD COLUMN `scrap_review_status` VARCHAR(32) NULL,
  ADD COLUMN `scrap_review_disposition` VARCHAR(32) NULL,
  ADD COLUMN `scrap_review_note` VARCHAR(500) NULL,
  ADD COLUMN `scrap_reviewed_by` INTEGER NULL,
  ADD COLUMN `scrap_reviewed_at` DATETIME(3) NULL;
