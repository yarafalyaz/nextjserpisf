-- Inti peristiwa perubahan aset terbekukan — gabungan vonis BOT 4
-- F-2026-10-23-111-V (revaluasi + impairment) dan F-2026-10-23-115-V
-- (reklasifikasi + perubahan metode/estimasi), gerbang kode akun
-- F-2026-10-23-128-V. SATU migrasi, SATU owner schema (BOT 3).
-- Semua aditif nullable TANPA default/backfill tebakan: baris kategori lama
-- NULL = fail-closed per peristiwa (E111-9/E128-1..3); baris setting lama
-- NULL = peristiwa fiskal berpersetujuan ditolak berisik (E111-3).

ALTER TABLE `asset_categories` ADD COLUMN `revaluation_surplus_account_id` INTEGER NULL;
ALTER TABLE `asset_categories` ADD COLUMN `impairment_loss_account_id` INTEGER NULL;
ALTER TABLE `asset_categories` ADD COLUMN `accumulated_impairment_account_id` INTEGER NULL;
ALTER TABLE `asset_categories` ADD INDEX `asset_categories_revaluation_surplus_account_id_idx` (`revaluation_surplus_account_id`);
ALTER TABLE `asset_categories` ADD INDEX `asset_categories_impairment_loss_account_id_idx` (`impairment_loss_account_id`);
ALTER TABLE `asset_categories` ADD INDEX `asset_categories_accumulated_impairment_account_id_idx` (`accumulated_impairment_account_id`);

ALTER TABLE `system_settings` ADD COLUMN `asset_fiscal_revaluation_tax_payable_account_id` INTEGER NULL;
ALTER TABLE `system_settings` ADD COLUMN `asset_fiscal_revaluation_final_tax_rate_percent` DECIMAL(5, 2) NULL;

-- CreateTable
CREATE TABLE `asset_change_events` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `asset_id` INTEGER NOT NULL,
    `kind` VARCHAR(40) NOT NULL,
    `status` VARCHAR(20) NOT NULL DEFAULT 'POSTED',
    `effective_date` DATETIME(3) NOT NULL,
    `source_document_key` VARCHAR(200) NOT NULL,
    `source_document_ref` VARCHAR(200) NULL,
    `journal_id` INTEGER NULL,
    `reverses_event_id` INTEGER NULL,
    `carrying_before` DECIMAL(15, 2) NULL,
    `carrying_after` DECIMAL(15, 2) NULL,
    `gross_before` DECIMAL(15, 2) NULL,
    `accumulated_before` DECIMAL(15, 2) NULL,
    `accumulated_impairment_before` DECIMAL(15, 2) NULL,
    `revaluation_surplus_before` DECIMAL(15, 2) NULL,
    `revaluation_surplus_after` DECIMAL(15, 2) NULL,
    `appraiser_name` VARCHAR(200) NULL,
    `revalued_class_name` VARCHAR(200) NULL,
    `impairment_indicator` VARCHAR(60) NULL,
    `recoverable_basis` VARCHAR(40) NULL,
    `recoverable_amount` DECIMAL(15, 2) NULL,
    `carrying_without_impairment` DECIMAL(15, 2) NULL,
    `is_goodwill_or_non_amortizing` BOOLEAN NOT NULL DEFAULT false,
    `from_category_id` INTEGER NULL,
    `to_category_id` INTEGER NULL,
    `reason_code` VARCHAR(60) NULL,
    `reason_note` TEXT NULL,
    `approved_by_name` VARCHAR(200) NULL,
    `old_method` VARCHAR(40) NULL,
    `new_method` VARCHAR(40) NULL,
    `old_useful_life_months` INTEGER NULL,
    `new_useful_life_months` INTEGER NULL,
    `old_residual_value` DECIMAL(15, 2) NULL,
    `new_residual_value` DECIMAL(15, 2) NULL,
    `djp_approval_number` VARCHAR(100) NULL,
    `djp_approval_date` DATETIME(3) NULL,
    `fiscal_base_before` DECIMAL(15, 2) NULL,
    `fiscal_base_after` DECIMAL(15, 2) NULL,
    `fiscal_surplus_amount` DECIMAL(15, 2) NULL,
    `final_tax_rate_percent` DECIMAL(5, 2) NULL,
    `final_tax_amount` DECIMAL(15, 2) NULL,
    `fiscal_useful_life_months_after` INTEGER NULL,
    `fiscal_group_code` VARCHAR(30) NULL,
    `fiscal_method_before` VARCHAR(40) NULL,
    `fiscal_method_after` VARCHAR(40) NULL,
    `surplus_account_id` INTEGER NULL,
    `surplus_account_code` VARCHAR(20) NULL,
    `impairment_loss_account_id` INTEGER NULL,
    `impairment_loss_account_code` VARCHAR(20) NULL,
    `accumulated_impairment_account_id` INTEGER NULL,
    `accumulated_impairment_account_code` VARCHAR(20) NULL,
    `fixed_asset_account_id` INTEGER NULL,
    `fixed_asset_account_code` VARCHAR(20) NULL,
    `accumulated_depreciation_account_id` INTEGER NULL,
    `accumulated_depreciation_account_code` VARCHAR(20) NULL,
    `tax_payable_account_id` INTEGER NULL,
    `tax_payable_account_code` VARCHAR(20) NULL,
    `to_fixed_asset_account_id` INTEGER NULL,
    `to_fixed_asset_account_code` VARCHAR(20) NULL,
    `to_accumulated_depreciation_account_id` INTEGER NULL,
    `to_accumulated_depreciation_account_code` VARCHAR(20) NULL,
    `to_accumulated_impairment_account_id` INTEGER NULL,
    `to_accumulated_impairment_account_code` VARCHAR(20) NULL,
    `created_by` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `asset_change_events_source_document_key_key` (`source_document_key`),
    UNIQUE INDEX `asset_change_events_reverses_event_id_key` (`reverses_event_id`),
    INDEX `asset_change_events_asset_id_idx` (`asset_id`),
    INDEX `asset_change_events_kind_idx` (`kind`),
    INDEX `asset_change_events_status_idx` (`status`),
    INDEX `asset_change_events_effective_date_idx` (`effective_date`),
    INDEX `asset_change_events_journal_id_idx` (`journal_id`),
    INDEX `asset_change_events_created_at_idx` (`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `asset_change_events` ADD CONSTRAINT `asset_change_events_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `asset_change_events` ADD CONSTRAINT `asset_change_events_reverses_event_id_fkey` FOREIGN KEY (`reverses_event_id`) REFERENCES `asset_change_events`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
