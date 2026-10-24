-- F-2026-10-21-008 (vonis BOT 4 F-2026-10-22-066-V + putusan flag Lead
-- MODE CATAT-DULU): scrap/yield terstruktur per baris issue. Semua kolom
-- aditif; baris lama tetap NULL/default 0 (= belum pernah mencatat scrap,
-- perilaku berjalan persis). Tanpa backfill.

-- AlterTable
ALTER TABLE `system_settings` ADD COLUMN `abnormal_scrap_posting_enabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `abnormal_scrap_expense_account_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `bom_revision_materials` ADD COLUMN `scrap_percent` DECIMAL(5, 2) NULL;

-- AlterTable
ALTER TABLE `material_issue_items` ADD COLUMN `scrap_qty` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `scrap_reason_code` VARCHAR(32) NULL,
    ADD COLUMN `scrap_note` VARCHAR(500) NULL,
    ADD COLUMN `scrap_percent_snapshot` DECIMAL(5, 2) NULL,
    ADD COLUMN `scrap_classified_at` DATETIME(3) NULL,
    ADD COLUMN `scrap_planned_qty_snapshot` DECIMAL(15, 2) NULL,
    ADD COLUMN `scrap_normal_qty_snapshot` DECIMAL(15, 2) NULL,
    ADD COLUMN `scrap_abnormal_qty_snapshot` DECIMAL(15, 2) NULL,
    ADD COLUMN `scrap_unit_cost_snapshot` DECIMAL(15, 2) NULL,
    ADD COLUMN `scrap_normal_value_snapshot` DECIMAL(15, 2) NULL,
    ADD COLUMN `scrap_abnormal_value_snapshot` DECIMAL(15, 2) NULL;

-- AlterTable
ALTER TABLE `production_order_materials` ADD COLUMN `scrap_percent_snapshot` DECIMAL(5, 2) NULL,
    ADD COLUMN `scrap_qty` DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `scrap_reason_code` VARCHAR(32) NULL,
    ADD COLUMN `scrap_note` VARCHAR(500) NULL,
    ADD COLUMN `scrap_classified_at` DATETIME(3) NULL,
    ADD COLUMN `scrap_normal_qty_snapshot` DECIMAL(15, 2) NULL,
    ADD COLUMN `scrap_abnormal_qty_snapshot` DECIMAL(15, 2) NULL,
    ADD COLUMN `scrap_unit_cost_snapshot` DECIMAL(15, 2) NULL,
    ADD COLUMN `scrap_normal_value_snapshot` DECIMAL(15, 2) NULL,
    ADD COLUMN `scrap_abnormal_value_snapshot` DECIMAL(15, 2) NULL;
